import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPaymeHandler, paymeCheckoutUrl, memoryStorage, PaymeError, PaymeCode, PaymeState,
} from '../src/index.js';

const KEY = 'test-key';
const AUTH = { authorization: 'Basic ' + Buffer.from(`Paycom:${KEY}`).toString('base64') };
const ORDERS = { 1: 50000_00, 2: 10000_00 }; // tiyinda

function setup() {
  let clock = 1_700_000_000_000;
  const events = [];
  const handle = createPaymeHandler({
    key: KEY,
    storage: memoryStorage(),
    now: () => clock,
    checkOrder({ account, amount }) {
      const expected = ORDERS[account.order_id];
      if (expected === undefined) throw new PaymeError(PaymeCode.ORDER_NOT_FOUND, 'order_id');
      if (expected !== amount) throw new PaymeError(PaymeCode.INVALID_AMOUNT);
    },
    onPerform: (tx) => events.push(['perform', tx.account.order_id]),
    onCancel: (tx) => events.push(['cancel', tx.account.order_id, tx.state]),
  });
  let rpcId = 0;
  const call = async (method, params, headers = AUTH) =>
    (await handle({ headers, body: { id: ++rpcId, method, params } })).body;
  return { call, handle, events, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('avtorizatsiya xato boʻlsa -32504', async () => {
  const { call } = setup();
  const r = await call('CheckPerformTransaction', {}, { authorization: 'Basic xxx' });
  assert.equal(r.error.code, -32504);
});

test('JSON xatosi va notoʻgʻri metod', async () => {
  const { handle, call } = setup();
  const r = await handle({ headers: AUTH, body: '{bad json' });
  assert.equal(r.status, 200);
  assert.equal(r.body.error.code, -32700);
  assert.equal((await call('Foo', {})).error.code, -32601);
});

test('CheckPerformTransaction', async () => {
  const { call } = setup();
  assert.deepEqual((await call('CheckPerformTransaction', { amount: 50000_00, account: { order_id: 1 } })).result, { allow: true });
  assert.equal((await call('CheckPerformTransaction', { amount: 1, account: { order_id: 1 } })).error.code, -31001);
  const r = await call('CheckPerformTransaction', { amount: 1, account: { order_id: 99 } });
  assert.equal(r.error.code, -31050);
  assert.equal(r.error.data, 'order_id');
  assert.deepEqual(Object.keys(r.error.message), ['ru', 'uz', 'en']);
});

test('toʻliq oqim: Create → Perform → Check', async () => {
  const { call, events, now } = setup();
  const p = { id: 'tx1', time: now(), amount: 50000_00, account: { order_id: 1 } };

  const c = (await call('CreateTransaction', p)).result;
  assert.equal(c.state, PaymeState.CREATED);
  assert.deepEqual((await call('CreateTransaction', p)).result, c, 'takroriy Create bir xil javob');

  const perf = (await call('PerformTransaction', { id: 'tx1' })).result;
  assert.equal(perf.state, PaymeState.PERFORMED);
  assert.deepEqual((await call('PerformTransaction', { id: 'tx1' })).result, perf, 'takroriy Perform bir xil javob');
  assert.deepEqual(events, [['perform', 1]], 'onPerform faqat bir marta');

  const chk = (await call('CheckTransaction', { id: 'tx1' })).result;
  assert.equal(chk.state, 2);
  assert.equal(chk.reason, null);
  assert.equal(chk.cancel_time, 0);
});

test('bir buyurtmaga ikkinchi tranzaksiya -31051', async () => {
  const { call, now } = setup();
  await call('CreateTransaction', { id: 'a', time: now(), amount: 50000_00, account: { order_id: 1 } });
  const r = await call('CreateTransaction', { id: 'b', time: now(), amount: 50000_00, account: { order_id: 1 } });
  assert.equal(r.error.code, -31051);
});

test('12 soatdan keyin tranzaksiya bekor boʻladi', async () => {
  const { call, tick, now } = setup();
  await call('CreateTransaction', { id: 't', time: now(), amount: 10000_00, account: { order_id: 2 } });
  tick(12 * 3600 * 1000 + 1);
  assert.equal((await call('PerformTransaction', { id: 't' })).error.code, -31008);
  const chk = (await call('CheckTransaction', { id: 't' })).result;
  assert.equal(chk.state, -1);
  assert.equal(chk.reason, 4);
});

test('CancelTransaction: yaratilgan va toʻlangan', async () => {
  const { call, events, now } = setup();
  await call('CreateTransaction', { id: 'x', time: now(), amount: 10000_00, account: { order_id: 2 } });
  const c1 = (await call('CancelTransaction', { id: 'x', reason: 3 })).result;
  assert.equal(c1.state, -1);
  assert.deepEqual((await call('CancelTransaction', { id: 'x', reason: 3 })).result, c1, 'takroriy Cancel');
  assert.equal((await call('PerformTransaction', { id: 'x' })).error.code, -31008);

  await call('CreateTransaction', { id: 'y', time: now(), amount: 50000_00, account: { order_id: 1 } });
  await call('PerformTransaction', { id: 'y' });
  const c2 = (await call('CancelTransaction', { id: 'y', reason: 5 })).result;
  assert.equal(c2.state, -2);
  assert.deepEqual(events.filter((e) => e[0] === 'cancel'), [['cancel', 2, -1], ['cancel', 1, -2]]);
  assert.equal((await call('CancelTransaction', { id: 'nope', reason: 1 })).error.code, -31003);
});

test('toʻlangan buyurtmani qaytarib boʻlmasa -31007', async () => {
  const handle = createPaymeHandler({
    key: KEY, storage: memoryStorage(), checkOrder() {},
    onCancel(tx) { if (tx.state === -2) throw new PaymeError(PaymeCode.CANNOT_CANCEL); },
  });
  const call = async (method, params) => (await handle({ headers: AUTH, body: { id: 1, method, params } })).body;
  await call('CreateTransaction', { id: 'z', time: 1, amount: 100, account: { order_id: 1 } });
  await call('PerformTransaction', { id: 'z' });
  assert.equal((await call('CancelTransaction', { id: 'z', reason: 5 })).error.code, -31007);
  assert.equal((await call('CheckTransaction', { id: 'z' })).result.state, 2);
});

test('GetStatement', async () => {
  const { call, now } = setup();
  const t = now();
  await call('CreateTransaction', { id: 's1', time: t, amount: 50000_00, account: { order_id: 1 } });
  await call('CreateTransaction', { id: 's2', time: t + 10, amount: 10000_00, account: { order_id: 2 } });
  const r = (await call('GetStatement', { from: t, to: t + 5 })).result;
  assert.deepEqual(r.transactions.map((x) => x.id), ['s1']);
  assert.equal(r.transactions[0].amount, 50000_00);
});

test('ichki xato -32400 boʻlib qaytadi', async () => {
  const handle = createPaymeHandler({ key: KEY, storage: memoryStorage(), checkOrder() { throw new Error('db down'); } });
  const orig = console.error; console.error = () => {};
  const r = await handle({ headers: AUTH, body: { id: 7, method: 'CheckPerformTransaction', params: {} } });
  console.error = orig;
  assert.equal(r.body.id, 7);
  assert.equal(r.body.error.code, -32400);
});

test('paymeCheckoutUrl', () => {
  const url = paymeCheckoutUrl({ merchantId: 'abc', amount: 15000.5, account: { order_id: 42 }, lang: 'uz', returnUrl: 'https://x.uz/ok' });
  assert.ok(url.startsWith('https://checkout.paycom.uz/'));
  const decoded = Buffer.from(url.split('/').pop(), 'base64').toString();
  assert.equal(decoded, 'm=abc;ac.order_id=42;a=1500050;l=uz;c=https://x.uz/ok');
  assert.ok(paymeCheckoutUrl({ merchantId: 'a', amount: 1, test: true }).startsWith('https://checkout.test.paycom.uz/'));
  assert.throws(() => paymeCheckoutUrl({ merchantId: 'a', amount: 0 }), TypeError);
});
