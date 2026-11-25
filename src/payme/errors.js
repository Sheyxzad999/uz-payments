/** Payme Merchant API xato kodlari */
export const PaymeCode = Object.freeze({
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  /** -31050 ... -31099: account (buyurtma) bilan bog'liq xatolar */
  ORDER_NOT_FOUND: -31050,
  ORDER_BUSY: -31051,
  INSUFFICIENT_PRIVILEGE: -32504,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  PARSE_ERROR: -32700,
  INTERNAL: -32400,
});

const MESSAGES = {
  [-31001]: ['Неверная сумма', 'Notoʻgʻri summa', 'Invalid amount'],
  [-31003]: ['Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found'],
  [-31007]: ['Невозможно отменить транзакцию', 'Tranzaksiyani bekor qilib boʻlmaydi', 'Cannot cancel transaction'],
  [-31008]: ['Невозможно выполнить операцию', 'Amalni bajarib boʻlmaydi', 'Cannot perform operation'],
  [-31050]: ['Заказ не найден', 'Buyurtma topilmadi', 'Order not found'],
  [-31051]: ['Заказ уже оплачивается', 'Buyurtma allaqachon toʻlanmoqda', 'Order is busy'],
  [-32504]: ['Недостаточно привилегий', 'Ruxsat yoʻq', 'Insufficient privilege'],
  [-32600]: ['Неверный запрос', 'Notoʻgʻri soʻrov', 'Invalid request'],
  [-32601]: ['Метод не найден', 'Metod topilmadi', 'Method not found'],
  [-32700]: ['Ошибка разбора JSON', 'JSON xatosi', 'Parse error'],
  [-32400]: ['Системная ошибка', 'Tizim xatosi', 'Internal error'],
};

export class PaymeError extends Error {
  /**
   * @param {number} code Payme xato kodi
   * @param {string} [data] qaysi maydon xato ekani (masalan "order_id")
   * @param {{ru:string, uz:string, en:string}} [message]
   */
  constructor(code, data, message) {
    const [ru, uz, en] = MESSAGES[code] ?? MESSAGES[-32400];
    super(en);
    this.name = 'PaymeError';
    this.code = code;
    this.data = data;
    this.payload = message ?? { ru, uz, en };
  }
}
