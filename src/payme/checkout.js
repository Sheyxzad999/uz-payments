const toBase64 = (s) =>
  typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s)));

/**
 * Payme to'lov sahifasiga havola yaratadi.
 * @param {object} o
 * @param {string} o.merchantId Kassa ID
 * @param {number} o.amount Summa soʻmda (avtomatik tiyinga oʻgiriladi)
 * @param {Record<string, string|number>} o.account Buyurtma maydonlari, masalan { order_id: 123 }
 * @param {string} [o.returnUrl] Toʻlovdan keyin qaytish manzili
 * @param {'uz'|'ru'|'en'} [o.lang]
 * @param {boolean} [o.test] Test muhit (checkout.test.paycom.uz)
 */
export function paymeCheckoutUrl({ merchantId, amount, account, returnUrl, lang, test = false }) {
  if (!merchantId) throw new TypeError('paymeCheckoutUrl: merchantId kerak');
  if (!(amount > 0)) throw new TypeError('paymeCheckoutUrl: amount musbat son boʻlishi kerak');
  const parts = [`m=${merchantId}`];
  for (const [k, v] of Object.entries(account ?? {})) parts.push(`ac.${k}=${v}`);
  parts.push(`a=${Math.round(amount * 100)}`);
  if (lang) parts.push(`l=${lang}`);
  if (returnUrl) parts.push(`c=${returnUrl}`);
  const host = test ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${host}/${toBase64(parts.join(';'))}`;
}
