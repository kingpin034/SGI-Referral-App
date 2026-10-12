import { authenticated, endpoint, HttpError, providerConfig, providerRequest, service } from '../_shared/runtime.ts';

endpoint(async (req) => {
  const { user } = await authenticated(req);
  providerConfig('KYC');
  const admin = service();
  const { data: profile, error } = await admin.from('profiles').select('id,full_name,phone,verification_status,ktp_path,selfie_path,kyc_submission_id,consent_at').eq('id', user.id).single();
  if (error || !profile || profile.verification_status !== 'pending' || !profile.kyc_submission_id || !profile.consent_at) throw new HttpError(409, 'Submit the identity form before requesting verification.');
  const { data: ktp, error: ktpError } = await admin.storage.from('identity-documents').createSignedUrl(profile.ktp_path, 300);
  const { data: selfie, error: selfieError } = await admin.storage.from('identity-documents').createSignedUrl(profile.selfie_path, 300);
  if (ktpError || selfieError || !ktp || !selfie) throw new HttpError(409, 'Identity documents are not available.');
  await providerRequest('KYC', '/verifications', { method: 'POST', headers: { 'Idempotency-Key': profile.kyc_submission_id }, body: JSON.stringify({
    profileId: user.id, submissionId: profile.kyc_submission_id, fullName: profile.full_name, phone: profile.phone,
    ktpUrl: ktp.signedUrl, selfieUrl: selfie.signedUrl, consentAt: profile.consent_at,
  }) });
  // Only the separately signed provider webhook may approve/reject identity.
  return { status: 'pending', submissionId: profile.kyc_submission_id };
});
