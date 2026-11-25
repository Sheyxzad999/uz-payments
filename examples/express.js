// npm i express uz-payments
import express from 'express';
import {
  createPaymeHandler, createClickHandler, paymeCheckoutUrl, clickPaymentUrl,
  memoryStorage, PaymeError, PaymeCode, ClickError, ClickCode,
} from 'uz-payments';

// Oddiy "baza" — productionda PostgreSQL/MongoDB ishlating
const orders = new Map([['1', { amount: 15000, status: 'new' }]]);

const payme = createPaymeHandler({
  key: process.env.PAYME_KEY,
  storage: memoryStorage(), // ⚠️ productionda oʻz storage'ingizni yozing (examples/postgres-storage.js)
  checkOrder({ account, amount }) {
    const order = orders.get(String(account.order_id));
    if (!order) throw new PaymeError(PaymeCode.ORDER_NOT_FOUND, 'order_id');
    if (order.amount * 100 !== amount) throw new PaymeError(PaymeCode.INVALID_AMOUNT);
    if (order.status === 'paid') throw new PaymeError(PaymeCode.ORDER_BUSY, 'order_id');
  },
  onPerform(tx) { orders.get(String(tx.account.order_id)).status = 'paid'; },
  onCancel(tx) { orders.get(String(tx.account.order_id)).status = 'cancelled'; },
});

const click = createClickHandler({
  serviceId: process.env.CLICK_SERVICE_ID,
  secretKey: process.env.CLICK_SECRET_KEY,
  prepare({ orderId, amount }) {
    const order = orders.get(orderId);
    if (!order) throw new ClickError(ClickCode.ORDER_NOT_FOUND);
    if (order.amount !== amount) throw new ClickError(ClickCode.INVALID_AMOUNT);
    if (order.status === 'paid') throw new ClickError(ClickCode.ALREADY_PAID);
    return orderId;
  },
  complete({ orderId }) {
    const order = orders.get(orderId);
    if (order.status === 'paid') throw new ClickError(ClickCode.ALREADY_PAID);
    order.status = 'paid';
    return orderId;
  },
  cancel({ orderId }) { orders.get(orderId).status = 'cancelled'; },
});

const app = express();

app.post('/payme', express.json(), async (req, res) => {
  const r = await payme({ headers: req.headers, body: req.body });
  res.status(r.status).json(r.body);
});

app.post('/click', express.urlencoded({ extended: false }), async (req, res) => {
  const r = await click(req.body);
  res.status(r.status).json(r.body);
});

app.get('/pay/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.sendStatus(404);
  res.json({
    payme: paymeCheckoutUrl({ merchantId: process.env.PAYME_MERCHANT_ID, amount: order.amount, account: { order_id: req.params.id } }),
    click: clickPaymentUrl({ serviceId: process.env.CLICK_SERVICE_ID, merchantId: process.env.CLICK_MERCHANT_ID, amount: order.amount, transactionParam: req.params.id }),
  });
});

app.listen(3000, () => console.log('http://localhost:3000'));
