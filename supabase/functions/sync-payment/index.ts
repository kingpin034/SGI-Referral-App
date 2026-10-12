import { authenticated, body, checkedPayment, digest, endpoint, HttpError, providerRequest, readOwnOrder, service, settle, string, uuid } from '../_shared/runtime.ts';

endpoint(async (req) => {
  const { client, user } = await authenticated(req);
  const input = await body(req);
  const orderId = uuid(input.orderId, 'order ID');
  const admin = service();
  const { data: order, error } = await admin.from('orders').select('*').eq('id', orderId).eq('buyer_id', user.id).maybeSingle();
  if (error || !order) throw new HttpError(404, 'Order not found.');
  if (order.payment_state === 'exception') throw new HttpError(409, 'Your payment needs finance review. Please contact support with your order number.');
  if (order.payment_state === 'paid') return await readOwnOrder(client, orderId);
  if (!order.provider_reference) throw new HttpError(409, 'The payment provider has not created this order yet.');
  // The button only asks for a server-to-server status refresh. No browser field can authorize payment.
  const payment = await providerRequest('PAYMENT', `/payments/${encodeURIComponent(order.provider_reference)}`, { method: 'GET' });
  checkedPayment(payment, order);
  if (payment.status === 'paid') {
    const eventId = `sync:${string(payment.eventId, 'provider event ID', 128)}`;
    const normalized = { orderId: payment.orderId, reference: payment.reference, amount: payment.amount, currency: payment.currency, paidAt: payment.paidAt };
    await settle(admin, payment, await digest(JSON.stringify(normalized)), eventId);
    const { data: updated } = await admin.from('orders').select('payment_state').eq('id', orderId).single();
    if (updated?.payment_state === 'exception') throw new HttpError(409, 'Payment received and awaiting finance review. Keep your order number.');
  } else if (['expired', 'failed', 'cancelled'].includes(payment.status)) {
    throw new HttpError(409, 'This payment has expired or failed. Start a new checkout.');
  } else if (payment.status !== 'pending') {
    throw new HttpError(502, 'Provider returned an unknown payment status.');
  }
  return await readOwnOrder(client, orderId);
});
