import { endpoint, HttpError, service, signedBody, string, uuid } from '../_shared/runtime.ts';

endpoint(async (req) => {
  const { event, payloadDigest } = await signedBody(req, 'KYC_WEBHOOK_SECRET');
  if (event.type !== 'kyc.completed' || !['verified', 'rejected'].includes(event.status)) throw new HttpError(400, 'Unsupported identity event.');
  const { error } = await service().rpc('apply_kyc_event', {
    p_event_id: string(event.eventId, 'event ID', 128), p_digest: payloadDigest, p_profile_id: uuid(event.profileId, 'profile ID'),
    p_submission_id: uuid(event.submissionId, 'submission ID'), p_status: event.status,
    p_reason: event.status === 'rejected' ? string(event.reason || 'Verification could not be completed.', 'reason', 300) : null,
  });
  if (error) throw new HttpError(409, 'Identity event could not be applied.');
  return { received: true };
}, true);
