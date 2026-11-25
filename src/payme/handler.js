import { PaymeError, PaymeCode } from './errors.js';

/** Tranzaksiya holatlari (Payme protokoli) */
export const PaymeState = Object.freeze({
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
});

const TIMEOUT_MS = 12 * 60 * 60 * 1000; // Payme: 12 soat
const REASON_TIMEOUT = 4;

/**
 * Payme Merchant API uchun handler yaratadi (framework'dan mustaqil).
 *
 * @param {object} o
 * @param {string} o.key Kassa kaliti (test yoki prod)
 * @param {import('../index.d.ts').PaymeStorage} o.storage Tranzaksiyalarni saqlash
 * @param {(p: { account: Record<string, any>, amount: number }) => Promise<void>|void} o.checkOrder
 *   Buyurtma mavjud va summasi toʻgʻriligini tekshiradi. amount — tiyinda.
 *   Xato boʻlsa `throw new PaymeError(PaymeCode.ORDER_NOT_FOUND, 'order_id')`.
 * @param {(tx: object) => Promise<void>|void} [o.onPerform] Toʻlov muvaffaqiyatli boʻlganda
 * @param {(tx: object) => Promise<void>|void} [o.onCancel] Toʻlov bekor qilinganda.
 *   Toʻlangan buyurtmani qaytarib boʻlmasa `throw new PaymeError(PaymeCode.CANNOT_CANCEL)`.
 * @param {() => number} [o.now] Vaqt (testlar uchun)
 */
export function createPaymeHandler({ key, storage, checkOrder, onPerform, onCancel, now = Date.now }) {
  if (!key) throw new TypeError('createPaymeHandler: key kerak');
  if (!storage) throw new TypeError('createPaymeHandler: storage kerak');
  if (typeof checkOrder !== 'function') throw new TypeError('createPaymeHandler: checkOrder kerak');

  const expectedAuth = 'Basic ' + toBase64(`Paycom:${key}`);

  const view = (tx) => ({
    create_time: tx.create_time,
    perform_time: tx.perform_time ?? 0,
    cancel_time: tx.cancel_time ?? 0,
    transaction: tx.transaction,
    state: tx.state,
    reason: tx.reason ?? null,
  });

  async function getTx(id) {
    const tx = await storage.find(id);
    if (!tx) throw new PaymeError(PaymeCode.TRANSACTION_NOT_FOUND, 'id');
    return tx;
  }

  async function cancel(tx, reason, state) {
    const patch = { state, reason, cancel_time: now() };
    await storage.update(tx.id, patch);
    return { ...tx, ...patch };
  }

  const isExpired = (tx) => now() - tx.create_time > TIMEOUT_MS;

  const methods = {
    async CheckPerformTransaction({ amount, account }) {
      await checkOrder({ account, amount });
      return { allow: true };
    },

    async CreateTransaction({ id, time, amount, account }) {
      const existing = await storage.find(id);
      if (existing) {
        if (existing.state !== PaymeState.CREATED) throw new PaymeError(PaymeCode.CANNOT_PERFORM);
        if (isExpired(existing)) {
          await cancel(existing, REASON_TIMEOUT, PaymeState.CANCELLED);
          throw new PaymeError(PaymeCode.CANNOT_PERFORM);
        }
        return { create_time: existing.create_time, transaction: existing.transaction, state: existing.state };
      }
      await checkOrder({ account, amount });
      if (storage.findActiveByAccount) {
        const busy = await storage.findActiveByAccount(account);
        if (busy && busy.id !== id) throw new PaymeError(PaymeCode.ORDER_BUSY, Object.keys(account)[0]);
      }
      const tx = {
        id,
        transaction: String(id),
        time,
        amount,
        account,
        create_time: now(),
        state: PaymeState.CREATED,
      };
      await storage.create(tx);
      return { create_time: tx.create_time, transaction: tx.transaction, state: tx.state };
    },

    async PerformTransaction({ id }) {
      let tx = await getTx(id);
      if (tx.state === PaymeState.PERFORMED) {
        return { transaction: tx.transaction, perform_time: tx.perform_time, state: tx.state };
      }
      if (tx.state !== PaymeState.CREATED) throw new PaymeError(PaymeCode.CANNOT_PERFORM);
      if (isExpired(tx)) {
        await cancel(tx, REASON_TIMEOUT, PaymeState.CANCELLED);
        throw new PaymeError(PaymeCode.CANNOT_PERFORM);
      }
      const patch = { state: PaymeState.PERFORMED, perform_time: now() };
      tx = { ...tx, ...patch };
      if (onPerform) await onPerform(tx);
      await storage.update(id, patch);
      return { transaction: tx.transaction, perform_time: tx.perform_time, state: tx.state };
    },

    async CancelTransaction({ id, reason }) {
      let tx = await getTx(id);
      if (tx.state === PaymeState.CREATED) {
        tx = await cancel(tx, reason, PaymeState.CANCELLED);
        if (onCancel) await onCancel(tx);
      } else if (tx.state === PaymeState.PERFORMED) {
        if (onCancel) await onCancel({ ...tx, state: PaymeState.CANCELLED_AFTER_PERFORM, reason });
        tx = await cancel(tx, reason, PaymeState.CANCELLED_AFTER_PERFORM);
      }
      return { transaction: tx.transaction, cancel_time: tx.cancel_time, state: tx.state };
    },

    async CheckTransaction({ id }) {
      return view(await getTx(id));
    },

    async GetStatement({ from, to }) {
      const list = storage.list ? await storage.list(from, to) : [];
      return {
        transactions: list.map((tx) => ({
          id: tx.id,
          time: tx.time,
          amount: tx.amount,
          account: tx.account,
          ...view(tx),
          receivers: tx.receivers ?? null,
        })),
      };
    },
  };

  /**
   * @param {{ headers: Record<string, string|undefined>, body: any }} req
   *   headers — kichik harfli kalitlar; body — JSON obyekt yoki satr
   * @returns {Promise<{ status: number, body: object }>} har doim HTTP 200
   */
  return async function handle({ headers = {}, body }) {
    let id = null;
    try {
      const auth = headers.authorization ?? headers.Authorization;
      let payload = body;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { throw new PaymeError(PaymeCode.PARSE_ERROR); }
      }
      id = payload?.id ?? null;
      if (auth !== expectedAuth) throw new PaymeError(PaymeCode.INSUFFICIENT_PRIVILEGE);
      if (!payload || typeof payload.method !== 'string') throw new PaymeError(PaymeCode.INVALID_REQUEST);
      const method = methods[payload.method];
      if (!method) throw new PaymeError(PaymeCode.METHOD_NOT_FOUND, payload.method);
      const result = await method(payload.params ?? {});
      return { status: 200, body: { jsonrpc: '2.0', id, result } };
    } catch (err) {
      const e = err instanceof PaymeError ? err : new PaymeError(PaymeCode.INTERNAL);
      if (!(err instanceof PaymeError)) console.error('[uz-payments] Payme:', err);
      return {
        status: 200,
        body: { jsonrpc: '2.0', id, error: { code: e.code, message: e.payload, data: e.data ?? null } },
      };
    }
  };
}

function toBase64(s) {
  return typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(s);
}
