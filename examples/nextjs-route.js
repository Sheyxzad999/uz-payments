// app/api/payme/route.js  (Next.js App Router)
import { createPaymeHandler } from 'uz-payments';
import { paymeStorage, checkOrder, markPaid, markCancelled } from '@/lib/payments';

const handle = createPaymeHandler({
  key: process.env.PAYME_KEY,
  storage: paymeStorage,
  checkOrder,
  onPerform: (tx) => markPaid(tx.account.order_id),
  onCancel: (tx) => markCancelled(tx.account.order_id),
});

export async function POST(req) {
  const r = await handle({
    headers: { authorization: req.headers.get('authorization') ?? undefined },
    body: await req.text(),
  });
  return Response.json(r.body, { status: r.status });
}
