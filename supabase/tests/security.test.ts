// Run: deno test --allow-env supabase/tests/security.test.ts
import { checkedPayment, HttpError, signedBody, uuid } from '../functions/_shared/runtime.ts';

const secretName = 'SGI_TEST_WEBHOOK_SECRET';
const secret = 'test-only-secret-never-use-for-a-provider';
const eventBody = JSON.stringify({ eventId: 'evt-1', type: 'payment.paid', amount: 2100000 });

async function request(raw = eventBody, signedRaw = raw, seconds = Math.floor(Date.now() / 1000)) {
  Deno.env.set(secretName, secret);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${seconds}.${signedRaw}`)));
  const signature = [...signed].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://test.invalid/webhook', { method: 'POST', body: raw, headers: { 'x-sgi-timestamp': String(seconds), 'x-sgi-signature': signature } });
}
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
async function rejects(run: () => unknown | Promise<unknown>, status: number) {
  try { await run(); } catch (error) { assert(error instanceof HttpError && error.status === status, `Expected HTTP ${status}`); return; }
  throw new Error(`Expected rejection with HTTP ${status}`);
}

Deno.test('valid raw-body HMAC returns the event and SHA-256 digest', async () => {
  const result = await signedBody(await request(), secretName);
  assert(result.event.eventId === 'evt-1' && /^[0-9a-f]{64}$/.test(result.payloadDigest), 'Valid signature was not accepted');
});
Deno.test('tampered payment amount invalidates HMAC', async () => {
  await rejects(async () => signedBody(await request(eventBody.replace('2100000', '2100001'), eventBody), secretName), 401);
});
Deno.test('reformatted JSON is not the signed raw body', async () => {
  await rejects(async () => signedBody(await request(JSON.stringify(JSON.parse(eventBody), null, 2), eventBody), secretName), 401);
});
Deno.test('expired webhook signatures are rejected', async () => {
  await rejects(async () => signedBody(await request(eventBody, eventBody, Math.floor(Date.now() / 1000) - 301), secretName), 401);
});
Deno.test('malformed or absent signature is rejected', async () => {
  await rejects(() => signedBody(new Request('https://test.invalid', { method: 'POST', body: eventBody }), secretName), 401);
});
Deno.test('missing webhook secret fails closed', async () => {
  Deno.env.delete('SGI_TEST_MISSING_SECRET');
  await rejects(async () => signedBody(await request(), 'SGI_TEST_MISSING_SECRET'), 503);
});
Deno.test('payment status must match ID, reference, amount and currency', async () => {
  const order = { id: 'order-a', provider_reference: 'payment-a', total: 2100000 };
  const payment = { orderId: 'order-a', reference: 'payment-a', amount: 2100000, currency: 'IDR' };
  checkedPayment(payment, order);
  for (const change of [{ orderId: 'order-b' }, { reference: 'payment-b' }, { amount: 1 }, { currency: 'USD' }]) {
    await rejects(() => checkedPayment({ ...payment, ...change }, order), 409);
  }
});
Deno.test('IDs must be valid UUIDs', async () => {
  assert(uuid('00000000-0000-4000-8000-000000000001', 'id') !== '', 'Valid UUID rejected');
  await rejects(() => uuid('../other-order', 'id'), 400);
});
