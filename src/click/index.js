import { createHash, timingSafeEqual } from 'node:crypto';

/** Click SHOP API xato kodlari */
export const ClickCode = Object.freeze({
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INVALID_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE: -7,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
});

const NOTES = {
  0: 'Success',
  [-1]: 'SIGN CHECK FAILED!',
  [-2]: 'Incorrect parameter amount',
  [-3]: 'Action not found',
  [-4]: 'Already paid',
  [-5]: 'User does not exist',
  [-6]: 'Transaction does not exist',
  [-7]: 'Failed to update user',
  [-8]: 'Error in request from click',
  [-9]: 'Transaction cancelled',
};

export class ClickError extends Error {
  /** @param {number} code @param {string} [note] */
  constructor(code, note) {
    super(note ?? NOTES[code] ?? 'Error');
    this.name = 'ClickError';
    this.code = code;
  }
}

/**
 * Click to'lov sahifasiga havola.
 * @param {object} o
 * @param {string|number} o.serviceId
 * @param {string|number} o.merchantId
 * @param {number} o.amount Summa soʻmda
 * @param {string|number} o.transactionParam Buyurtma ID (merchant_trans_id)
 * @param {string} [o.returnUrl]
 */
export function clickPaymentUrl({ serviceId, merchantId, amount, transactionParam, returnUrl }) {
  if (!serviceId || !merchantId) throw new TypeError('clickPaymentUrl: serviceId va merchantId kerak');
  if (!(amount > 0)) throw new TypeError('clickPaymentUrl: amount musbat son boʻlishi kerak');
  const q = new URLSearchParams({
    service_id: String(serviceId),
    merchant_id: String(merchantId),
    amount: Number(amount).toFixed(2),
    transaction_param: String(transactionParam),
  });
  if (returnUrl) q.set('return_url', returnUrl);
  return `https://my.click.uz/services/pay?${q}`;
}

/** Click so'rovining imzosini hisoblaydi (md5). */
export function clickSign(p, secretKey) {
  const s =
    String(p.click_trans_id) + String(p.service_id) + secretKey + String(p.merchant_trans_id) +
    (String(p.action) === '1' ? String(p.merchant_prepare_id ?? '') : '') +
    String(p.amount) + String(p.action) + String(p.sign_time);
  return createHash('md5').update(s).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Click SHOP API (Prepare + Complete) uchun handler.
 *
 * @param {object} o
 * @param {string|number} o.serviceId
 * @param {string} o.secretKey
 * @param {(p: { orderId: string, amount: number, clickTransId: string }) => Promise<string|number>|string|number} o.prepare
 *   Buyurtmani tekshiradi va merchant_prepare_id qaytaradi (masalan bazadagi yozuv ID'si).
 *   Xato boʻlsa `throw new ClickError(ClickCode.ORDER_NOT_FOUND)`.
 * @param {(p: { orderId: string, amount: number, clickTransId: string, prepareId: string }) => Promise<string|number>|string|number} o.complete
 *   Toʻlovni tasdiqlaydi va merchant_confirm_id qaytaradi. Takroriy chaqiruvda `ClickError(ALREADY_PAID)`.
 * @param {(p: { orderId: string, clickTransId: string, prepareId: string, error: number }) => Promise<void>|void} [o.cancel]
 *   Click toʻlovni bekor qilganda (error < 0 bilan kelgan Complete).
 */
export function createClickHandler({ serviceId, secretKey, prepare, complete, cancel }) {
  if (!secretKey) throw new TypeError('createClickHandler: secretKey kerak');
  if (typeof prepare !== 'function' || typeof complete !== 'function') {
    throw new TypeError('createClickHandler: prepare va complete kerak');
  }

  /**
   * @param {Record<string, string>} body form-urlencoded maydonlar (parse qilingan)
   * @returns {Promise<{ status: number, body: object }>}
   */
  return async function handle(body = {}) {
    const p = body instanceof URLSearchParams ? Object.fromEntries(body) : body;
    const action = String(p.action);
    const base = { click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id };
    const reply = (extra, code, note) => ({
      status: 200,
      body: { ...base, ...extra, error: code, error_note: note ?? NOTES[code] },
    });
    try {
      if (!p.click_trans_id || !p.merchant_trans_id || p.amount == null || !p.sign_string) {
        throw new ClickError(ClickCode.BAD_REQUEST);
      }
      if (serviceId != null && String(p.service_id) !== String(serviceId)) {
        throw new ClickError(ClickCode.BAD_REQUEST);
      }
      if (!safeEqual(clickSign(p, secretKey), p.sign_string)) throw new ClickError(ClickCode.SIGN_CHECK_FAILED);

      const args = { orderId: String(p.merchant_trans_id), amount: Number(p.amount), clickTransId: String(p.click_trans_id) };

      if (action === '0') {
        const prepareId = await prepare(args);
        return reply({ merchant_prepare_id: prepareId }, ClickCode.SUCCESS);
      }
      if (action === '1') {
        const prepareId = String(p.merchant_prepare_id ?? '');
        if (Number(p.error) < 0) {
          if (cancel) await cancel({ ...args, prepareId, error: Number(p.error) });
          return reply({ merchant_confirm_id: null }, ClickCode.TRANSACTION_CANCELLED);
        }
        const confirmId = await complete({ ...args, prepareId });
        return reply({ merchant_confirm_id: confirmId }, ClickCode.SUCCESS);
      }
      throw new ClickError(ClickCode.ACTION_NOT_FOUND);
    } catch (err) {
      const e = err instanceof ClickError ? err : new ClickError(ClickCode.FAILED_TO_UPDATE);
      if (!(err instanceof ClickError)) console.error('[uz-payments] Click:', err);
      const idKey = action === '1' ? 'merchant_confirm_id' : 'merchant_prepare_id';
      return reply({ [idKey]: null }, e.code, e.message);
    }
  };
}
