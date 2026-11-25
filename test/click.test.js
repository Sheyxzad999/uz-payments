import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClickHandler, clickPaymentUrl, clickSign, ClickError, ClickCode } from '../src/index.js';

const SECRET = 'secret';
const SERVICE = '123';
const md5 = (s) => createHash('md5').update(s).digest('hex');

function setup() {
  const orders = { 'order-1': { amount: 15000, paid: false } };
  const log = [];
  const handle = createClickHandler({
    serviceId: SERVICE,
    secretKey: SECRET,
    prepare({ orderId, amount }) {
      const o = orders[orderId];
      if (!o) throw new ClickError(ClickCode.ORDER_NOT_FOUND);
      if (o.amount !== amount) throw new ClickError(ClickCode.INVALID_AMOUNT);
      if (o.paid) throw new ClickError(ClickCode.ALREADY_PAID);
      return 555;
    },
    complete({ orderId, prepareId }) {
      const o = orders[orderId];
      if (o.paid) throw new ClickError(ClickCode.ALREADY_PAID);
      o.paid = true;
      log.push(['complete', orderId, prepareId]);
      return 777;
    },
    cancel: ({ orderId, error }) => log.push(['cancel', orderId, error]),
  });
  return { handle, orders, log };
}

function req(fields) {
  const p = {
    click_trans_id: '9001', service_id: SERVICE, click_paydoc_id: '1', merchant_trans_id: 'order-1',
    amount: '15000', action: '0', error: '0', error_note: 'Success', sign_time: '2026-11-25 12:00:00', ...fields,
  };
  p.sign_string = fields.sign_string ?? clickSign(p, SECRET);
  return p;
}

test('clickSign Click hujjatidagi formula boʻyicha', () => {
  const p = req({});
  assert.equal(p.sign_string, md5('9001' + SERVICE + SECRET + 'order-1' + '15000' + '0' + '2026-11-25 12:00:00'));
  const c = req({ action: '1', merchant_prepare_id: '555' });
  assert.equal(c.sign_string, md5('9001' + SERVICE + SECRET + 'order-1' + '555' + '15000' + '1' + '2026-11-25 12:00:00'));
});

test('Prepare → Complete', async () => {
  const { handle, orders, log } = setup();
  const prep = (await handle(req({}))).body;
  assert.equal(prep.error, 0);
  assert.equal(prep.merchant_prepare_id, 555);
  assert.equal(prep.click_trans_id, '9001');

  const comp = (await handle(req({ action: '1', merchant_prepare_id: '555' }))).body;
  assert.equal(comp.error, 0);
  assert.equal(comp.merchant_confirm_id, 777);
  assert.equal(orders['order-1'].paid, true);
  assert.deepEqual(log, [['complete', 'order-1', '555']]);

  const again = (await handle(req({ action: '1', merchant_prepare_id: '555' }))).body;
  assert.equal(again.error, -4);
});

test('imzo notoʻgʻri boʻlsa -1', async () => {
  const { handle } = setup();
  const r = (await handle(req({ sign_string: 'deadbeef' }))).body;
  assert.equal(r.error, -1);
  assert.equal(r.merchant_prepare_id, null);
});

test('buyurtma yoʻq / summa xato / service_id begona', async () => {
  const { handle } = setup();
  assert.equal((await handle(req({ merchant_trans_id: 'nope' }))).body.error, -5);
  assert.equal((await handle(req({ amount: '1' }))).body.error, -2);
  assert.equal((await handle(req({ service_id: '999' }))).body.error, -8);
  assert.equal((await handle({})).body.error, -8);
  assert.equal((await handle(req({ action: '5' }))).body.error, -3);
});

test('Click bekor qilsa (error < 0) → cancel va -9', async () => {
  const { handle, orders, log } = setup();
  const r = (await handle(req({ action: '1', merchant_prepare_id: '555', error: '-5017' }))).body;
  assert.equal(r.error, -9);
  assert.equal(orders['order-1'].paid, false);
  assert.deepEqual(log, [['cancel', 'order-1', -5017]]);
});

test('URLSearchParams ham qabul qilinadi', async () => {
  const { handle } = setup();
  const r = (await handle(new URLSearchParams(req({})))).body;
  assert.equal(r.error, 0);
});

test('clickPaymentUrl', () => {
  const url = new URL(clickPaymentUrl({ serviceId: 1, merchantId: 2, amount: 15000, transactionParam: 'order-1', returnUrl: 'https://x.uz' }));
  assert.equal(url.origin + url.pathname, 'https://my.click.uz/services/pay');
  assert.equal(url.searchParams.get('amount'), '15000.00');
  assert.equal(url.searchParams.get('transaction_param'), 'order-1');
  assert.equal(url.searchParams.get('return_url'), 'https://x.uz');
});
