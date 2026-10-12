import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, `Server integration is not configured: ${name}`);
  return value;
}
export function service(): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authenticated(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in with your verified phone first.');
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return { client, user: data.user };
}
export function cors(req: Request): HeadersInit {
  const origin = req.headers.get('Origin');
  const allowed = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'This application origin is not allowed.');
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store',
  };
}
export function endpoint(handler: (req: Request) => Promise<unknown>, webhook = false) {
  Deno.serve(async (req) => {
    let headers: HeadersInit = { 'Cache-Control': 'no-store' };
    try {
      if (!webhook) headers = cors(req);
      if (req.method === 'OPTIONS' && !webhook) return new Response(null, { status: 204, headers });
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
      const result = await handler(req);
      return Response.json(result, { headers });
    } catch (error) {
      const known = error instanceof HttpError;
      // Never log identity documents, bearer tokens, provider bodies, or bank account/payment payloads.
      if (!known) console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
      return Response.json({ error: known ? error.message : 'Unable to complete this request. Please retry.' }, { status: known ? error.status : 500, headers });
    }
  });
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 65536) throw new HttpError(413, 'Request is too large.');
  try { const value = JSON.parse(raw); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch { /* handled below */ }
  throw new HttpError(400, 'A JSON object is required.');
}
export function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `Invalid ${label}.`);
  return value;
}
export function uuid(value: unknown, label: string): string {
  const valueString = string(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueString)) throw new HttpError(400, `Invalid ${label}.`);
  return valueString;
}
export function providerConfig(kind: 'PAYMENT' | 'KYC') {
  const base = new URL(required(`${kind}_BRIDGE_URL`));
  if (base.protocol !== 'https:') throw new HttpError(503, `${kind} bridge must use HTTPS.`);
  return { base: base.href.replace(/\/$/, ''), token: required(`${kind}_BRIDGE_TOKEN`) };
}
export async function providerRequest(kind: 'PAYMENT' | 'KYC', path: string, init: RequestInit = {}) {
  const config = providerConfig(kind);
  let response: Response;
  try {
    response = await fetch(`${config.base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...init.headers } });
  } catch { throw new HttpError(502, `${kind} provider is temporarily unavailable. Retry using the same request.`); }
  if (!response.ok) throw new HttpError(502, `${kind} provider could not complete this request. Please retry.`);
  try { return await response.json(); } catch { throw new HttpError(502, `${kind} provider returned an invalid response.`); }
}
export async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function signedBody(req: Request, secretName: string) {
  const secret = required(secretName);
  const timestamp = req.headers.get('x-sgi-timestamp') ?? '';
  const signature = (req.headers.get('x-sgi-signature') ?? '').replace(/^sha256=/, '').toLowerCase();
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) throw new HttpError(401, 'Invalid webhook signature.');
  const raw = await req.text();
  if (raw.length > 65536) throw new HttpError(413, 'Request is too large.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const received = new Uint8Array(signature.match(/../g)!.map((hex) => parseInt(hex, 16)));
  // Delegate signature comparison to WebCrypto instead of comparing secret bytes in JavaScript.
  const valid = await crypto.subtle.verify('HMAC', key, received, new TextEncoder().encode(`${timestamp}.${raw}`));
  if (!valid) throw new HttpError(401, 'Invalid webhook signature.');
  try {
    const event = JSON.parse(raw);
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error();
    return { event, payloadDigest: await digest(raw) };
  } catch { throw new HttpError(400, 'Invalid webhook JSON.'); }
}
export async function readOwnOrder(client: SupabaseClient, orderId: string) {
  const { data, error } = await client.rpc('get_order', { p_order_id: orderId });
  if (error) throw new HttpError(404, 'Order not found.');
  return data;
}
export function checkedPayment(value: Record<string, unknown>, order: Record<string, unknown>) {
  if (value.orderId !== order.id || value.reference !== order.provider_reference || value.amount !== order.total || value.currency !== 'IDR') throw new HttpError(409, 'Payment details do not match the order.');
}
export async function settle(client: SupabaseClient, payment: Record<string, unknown>, payloadDigest: string, eventId: string) {
  const paidAt = string(payment.paidAt, 'payment time', 50);
  if (!Number.isFinite(Date.parse(paidAt)) || !Number.isSafeInteger(payment.amount) || Number(payment.amount) <= 0) throw new HttpError(400, 'Invalid payment amount or date.');
  const { error } = await client.rpc('settle_payment', {
    p_event_id: eventId, p_digest: payloadDigest, p_order_id: uuid(payment.orderId, 'order ID'),
    p_reference: string(payment.reference, 'payment reference', 200), p_amount: payment.amount,
    p_currency: payment.currency, p_paid_at: paidAt,
  });
  if (error) throw new HttpError(409, 'Payment could not be matched or allocated. Please contact support if payment was debited.');
}
