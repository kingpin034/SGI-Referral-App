import { endpoint, HttpError, service, settle, signedBody, string } from '../_shared/runtime.ts';

endpoint(async (req) => {
  const { event, payloadDigest } = await signedBody(req, 'PAYMENT_WEBHOOK_SECRET');
  if (event.type !== 'payment.paid') throw new HttpError(400, 'Unsupported payment event.');
  await settle(service(), event, payloadDigest, string(event.eventId, 'event ID', 128));
  return { received: true };
}, true);
