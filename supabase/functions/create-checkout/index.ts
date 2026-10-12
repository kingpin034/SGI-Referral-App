import { authenticated, body, endpoint, HttpError, providerConfig, providerRequest, readOwnOrder, service, string, uuid } from '../_shared/runtime.ts';

endpoint(async (req) => {
  const { client, user } = await authenticated(req);
  providerConfig('PAYMENT'); // A missing integration never creates an apparently payable order.
  const input = await body(req);
  if (!Number.isInteger(input.quantity) || Number(input.quantity) < 1 || Number(input.quantity) > 100) throw new HttpError(400, 'Quantity must be between 1 and 100.');
  if (!['customer', 'classic', 'premium'].includes(String(input.intent)) || !['qris', 'va'].includes(String(input.paymentMethod))) throw new HttpError(400, 'Invalid checkout selection.');
  const admin = service();
  const { data: order, error } = await admin.rpc('create_checkout_draft', {
    p_buyer_id: user.id, p_product_id: string(input.productId, 'product'), p_quantity: input.quantity,
    p_intent: input.intent, p_stockpoint_id: uuid(input.stockpointId, 'stockpoint'), p_payment_method: input.paymentMethod,
    p_idempotency_key: string(input.idempotencyKey, 'request identifier', 150),
  });
  if (error || !order) throw new HttpError(409, error?.message ?? 'Checkout could not be created.');
  if (order.provider_reference) return await readOwnOrder(client, order.id);
  if (Date.parse(order.expires_at) <= Date.now()) throw new HttpError(409, 'This checkout has expired. Start a new order.');
  // Bridge MUST guarantee idempotency for this order ID across timeouts/retries/concurrent requests.
  const payment = await providerRequest('PAYMENT', '/payments', {
    method: 'POST', headers: { 'Idempotency-Key': order.id }, body: JSON.stringify({ orderId: order.id, amount: order.total,
      currency: order.currency, method: order.payment_method, expiresAt: order.expires_at, description: `${order.product_name} × ${order.quantity}` }),
  });
  if (payment.orderId !== order.id || payment.amount !== order.total || payment.currency !== 'IDR') throw new HttpError(502, 'Provider returned an incorrect payment intent.');
  const reference = string(payment.reference, 'provider reference', 200);
  const qr = order.payment_method === 'qris' ? string(payment.qrPayload, 'QRIS payload', 5000) : null;
  const virtualAccount = order.payment_method === 'va' ? string(payment.virtualAccount, 'virtual account', 100) : null;
  const { error: attachError } = await admin.rpc('attach_payment_intent', { p_order_id: order.id, p_reference: reference, p_qr: qr, p_virtual_account: virtualAccount });
  if (attachError) throw new HttpError(409, 'Payment intent conflict. Retry the same order.');
  return await readOwnOrder(client, order.id);
});
