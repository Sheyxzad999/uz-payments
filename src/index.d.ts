// ---------- Payme ----------
export declare const PaymeCode: Readonly<{
  INVALID_AMOUNT: -31001; TRANSACTION_NOT_FOUND: -31003; CANNOT_CANCEL: -31007; CANNOT_PERFORM: -31008;
  ORDER_NOT_FOUND: -31050; ORDER_BUSY: -31051; INSUFFICIENT_PRIVILEGE: -32504; INVALID_REQUEST: -32600;
  METHOD_NOT_FOUND: -32601; PARSE_ERROR: -32700; INTERNAL: -32400;
}>;
export declare const PaymeState: Readonly<{ CREATED: 1; PERFORMED: 2; CANCELLED: -1; CANCELLED_AFTER_PERFORM: -2 }>;

export declare class PaymeError extends Error {
  constructor(code: number, data?: string, message?: { ru: string; uz: string; en: string });
  code: number;
  data?: string;
}

export interface PaymeTransaction {
  id: string;
  transaction: string;
  time: number;
  /** tiyinda */
  amount: number;
  account: Record<string, any>;
  create_time: number;
  perform_time?: number;
  cancel_time?: number;
  state: 1 | 2 | -1 | -2;
  reason?: number | null;
}

export interface PaymeStorage {
  find(id: string): Promise<PaymeTransaction | null>;
  create(tx: PaymeTransaction): Promise<void>;
  update(id: string, patch: Partial<PaymeTransaction>): Promise<void>;
  /** GetStatement uchun (ixtiyoriy) */
  list?(from: number, to: number): Promise<PaymeTransaction[]>;
  /** Bir buyurtmaga ikkinchi tranzaksiyani bloklash uchun (ixtiyoriy, tavsiya etiladi) */
  findActiveByAccount?(account: Record<string, any>): Promise<PaymeTransaction | null>;
}

export interface PaymeHandlerOptions {
  key: string;
  storage: PaymeStorage;
  /** amount — tiyinda */
  checkOrder(p: { account: Record<string, any>; amount: number }): void | Promise<void>;
  onPerform?(tx: PaymeTransaction): void | Promise<void>;
  onCancel?(tx: PaymeTransaction): void | Promise<void>;
  now?(): number;
}

export interface HandlerResponse { status: number; body: Record<string, any> }

export declare function createPaymeHandler(
  options: PaymeHandlerOptions,
): (req: { headers: Record<string, string | undefined>; body: unknown }) => Promise<HandlerResponse>;

export declare function paymeCheckoutUrl(o: {
  merchantId: string;
  /** soʻmda */
  amount: number;
  account?: Record<string, string | number>;
  returnUrl?: string;
  lang?: 'uz' | 'ru' | 'en';
  test?: boolean;
}): string;

// ---------- Click ----------
export declare const ClickCode: Readonly<{
  SUCCESS: 0; SIGN_CHECK_FAILED: -1; INVALID_AMOUNT: -2; ACTION_NOT_FOUND: -3; ALREADY_PAID: -4;
  ORDER_NOT_FOUND: -5; TRANSACTION_NOT_FOUND: -6; FAILED_TO_UPDATE: -7; BAD_REQUEST: -8; TRANSACTION_CANCELLED: -9;
}>;

export declare class ClickError extends Error {
  constructor(code: number, note?: string);
  code: number;
}

export interface ClickArgs { orderId: string; amount: number; clickTransId: string }

export interface ClickHandlerOptions {
  serviceId?: string | number;
  secretKey: string;
  prepare(p: ClickArgs): string | number | Promise<string | number>;
  complete(p: ClickArgs & { prepareId: string }): string | number | Promise<string | number>;
  cancel?(p: ClickArgs & { prepareId: string; error: number }): void | Promise<void>;
}

export declare function createClickHandler(
  options: ClickHandlerOptions,
): (body: Record<string, string> | URLSearchParams) => Promise<HandlerResponse>;

export declare function clickSign(p: Record<string, string | number>, secretKey: string): string;

export declare function clickPaymentUrl(o: {
  serviceId: string | number;
  merchantId: string | number;
  /** soʻmda */
  amount: number;
  transactionParam: string | number;
  returnUrl?: string;
}): string;

// ---------- Utils ----------
export declare function memoryStorage(): Required<PaymeStorage>;
