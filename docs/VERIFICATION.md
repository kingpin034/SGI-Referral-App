# Verification record

Validated the standalone reseller/buyer project locally before handoff.

## Automated checks

- `npm ci`: pinned dependency installation succeeded in the final SGI-Referral directory; npm reported no vulnerabilities.
- `npm run build`: TypeScript and production Vite build passed.
- `npm test`: 16 domain/repository tests passed.
- `npm run test:db`: 16 PostgreSQL migration/authorization checks passed with PGlite, including payment idempotency, serial allocation, commission eligibility and protected pickup information.
- Edge Function TypeScript was checked separately; the eight signed-webhook validation cases were exercised with a Node WebCrypto harness. The maintained security tests use Deno: `deno test --allow-env supabase/tests/security.test.ts`.

The PostgreSQL tests stub Supabase Auth/Storage schemas and pgcrypto functions. They do not replace integration testing against the chosen Supabase project and payment/KYC providers.

## Browser checks

- Mobile widths of 320 px and 390 px; desktop width of 1280 px.
- No horizontal overflow in checked main/list/detail views. Visible text checks returned a 10 px minimum. Chart empty text is HTML rather than scaled SVG text.
- Referral transaction pagination changes the visible records; status filtering resets pagination.
- Network Level 1/2/3 tabs and member details.
- Referral URL opens Account and prefills its referral code.
- Synthetic KTP/selfie + sandbox OTP progresses through pending verification to a verified profile.
- Premium qualification rejects 10 g and accepts 20 g; Classic accepts a single 10 g purchase.
- QRIS and Virtual Account sandbox payment flows reach pickup receipts.
- Closing an unpaid checkout and reopening it through My Orders resumes that payment.
- Selected stockpoint and referral attribution are retained in the receipt.
- Production build without configured Supabase credentials shows an explicit unconfigured state, with no sandbox badge or sample transactions.
- No browser errors or warnings were reported during the final app check.

The local development preview runs in an explicitly labelled sandbox. Production payment collection and identity verification require the setup in DEPLOYMENT.md and vendor integration checks.
