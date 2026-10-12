# Supabase backend and provider contracts

This app has a real Supabase repository and a separate, explicitly selected local sandbox. The Supabase migration and five Edge Functions implement the customer/reseller interface. They do not connect to an actual payment or identity vendor until you supply a bridge implementing the contracts below. Missing bridge settings return HTTP 503. No credentials or real customer records are included.

Use [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel frontend. Vercel hosts the web app; Supabase hosts Auth, Postgres, private identity documents and Edge Functions. Service-role keys, bridge tokens and signing secrets belong only in Supabase secrets, never in a `VITE_` variable.

## Backend setup

1. Create a Supabase project. Select and verify a hosting/data-processing arrangement suitable for SGI's requirements; this code cannot guarantee Indonesian data residency for Supabase or a chosen provider.
2. Apply `supabase/migrations/202610120001_referral_mvp.sql` to a fresh project using the Supabase CLI (`supabase link --project-ref YOUR_REF`, then `supabase db push`) or the SQL editor. Do not apply a fresh-project migration over unrelated existing tables.
3. Enable phone sign-in and configure the WhatsApp-capable OTP provider supported by your Supabase Auth setup. The frontend requests `channel: 'whatsapp'`. A generic SMS configuration alone does not provide WhatsApp delivery. Phone changes must also complete OTP confirmation before the stored profile phone changes. Set your deployed frontend as the Auth Site URL and approved redirect origin.
4. Configure Auth abuse controls, provider quotas and rate limits for the expected pilot. No OTP or real KTP data should be used in the local sandbox.
5. Fill an untracked copy of `supabase/.env.example`; install it with `supabase secrets set --env-file YOUR_SECRET_FILE`. Include exact frontend origins in comma-separated `APP_ORIGINS` (scheme and hostname; no trailing slash). Add localhost only to development projects.
6. Deploy `create-checkout`, `sync-payment`, `submit-kyc`, `payment-webhook`, and `kyc-webhook`. `supabase/config.toml` deliberately disables gateway JWT enforcement; the first three functions verify the bearer session with `auth.getUser()`, and webhook functions independently verify timestamped HMAC signatures.
7. Configure webhook URLs at your bridges: `https://PROJECT_REF.supabase.co/functions/v1/payment-webhook` and `/functions/v1/kyc-webhook`.
8. Import actual stockpoints, serialized inventory and an authorized live daily price. The migration contains only the four catalogue products and sample pricing. No physical inventory is invented. Checkout blocks sample prices by default and prices older than 24 hours.
9. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel frontend, set `VITE_ENABLE_SANDBOX=false`, and redeploy. The anon/publishable key is safe for frontend use with the included policies; the service-role key is not.

Example CLI deployment, from this app directory:

```sh
supabase link --project-ref YOUR_REF
supabase db push
supabase secrets set --env-file /secure/path/sgi-supabase.env
supabase functions deploy create-checkout
supabase functions deploy sync-payment
supabase functions deploy submit-kyc
supabase functions deploy payment-webhook
supabase functions deploy kyc-webhook
```

The bundled local config targets PostgreSQL 15. Use `supabase start` and `supabase db reset` in a disposable local environment for migration execution and integration testing before applying to a production project. Docker/Supabase CLI are not included with this frontend.

## Data and authorization

| Resource | Access and behavior |
| --- | --- |
| `profiles` | One row per `auth.users` account. A trigger synchronizes the confirmed phone. Tier, identity status and attribution cannot be directly updated by browser roles. |
| `products`, `gold_prices`, `stockpoints` | Public read access to active catalogue/stockpoints and published price. Writes are service-only. Exact sizes: 0.5, 1, 5 and 10 grams. |
| `identity-documents` | Private bucket, maximum 8 MiB each, JPEG/PNG/WebP only. Authenticated users can upload/read only their own UUID folder. No client overwrite/delete policies. |
| `orders`, `serial_inventory` | Browser has no direct table access. Authorized RPC responses return only the buyer's orders or the signed-in user's referral chain orders. Pickup tokens, serial numbers and payment credentials appear only on the buyer's own orders. |
| `commission_ledger` | Immutable posting per paid order/recipient/level. Eligibility and recipient tier are evaluated server-side at settlement. No browser writes. |
| `provider_events`, `audit_log` | Server-only event deduplication and operational audit records. Raw KTP images, bearer tokens and full vendor bodies are not written to logs. |
| `payouts` | Schema for a later finance process; this app displays balances and the next 20th. It does not execute bank payouts or a payout scheduler. |

All business tables have RLS enabled. The only browser-executable business RPCs are `get_app_data`, `get_order` and `submit_verification`. Internal helpers and settlement operations have explicit `EXECUTE` revocations. The service role is trusted infrastructure, so keep it out of customer sessions.

`get_app_data()` returns the camelCase `AppData` shape in `src/lib/types.ts`. It also supports anonymous catalogue loads, with a null profile and empty personal lists. Network and referral-order names are shortened (first name and initial); phone numbers and identity documents of other members are excluded. Other members' order commission amounts use `commissionVisible: false` (the numeric placeholder is not an actual zero commission). Rates are percentages: `1` means 1%, `0.75` means 0.75%.

`submit_verification(p_full_name, p_referral_code, p_ktp_path, p_selfie_path, p_consent)` requires a confirmed Auth phone, explicit consent, and two existing private documents under the caller's UUID folder. A nonempty referral code must belong to an already registered member whose attribution is locked. First submission fixes the referrer permanently, including a submission without a code. Resubmission after rejection preserves that attribution. The buyer cannot self-approve KYC or choose a tier. A later signed provider event can approve the current submission.

Owner document uploads cannot be removed by the frontend after submission. Operate a privileged retention/cleanup job for abandoned uploads, old rejected submissions and the retention policy selected by SGI. No cleanup schedule is assumed by this app.

## Payment bridge

Configure `PAYMENT_BRIDGE_URL`, `PAYMENT_BRIDGE_TOKEN` and a separate high-entropy `PAYMENT_WEBHOOK_SECRET`. The bridge URL must be HTTPS. Outbound requests use `Authorization: Bearer YOUR_BRIDGE_TOKEN`, JSON, a 20-second timeout and no redirects. Build the bridge for the selected QRIS/VA provider; it must verify that provider's native callbacks before forwarding normalized events.

### Create payment

`POST {PAYMENT_BRIDGE_URL}/payments`, with `Idempotency-Key: <order UUID>`:

```json
{
  "orderId": "ORDER_UUID",
  "amount": 21000000,
  "currency": "IDR",
  "method": "qris",
  "expiresAt": "2026-10-12T04:15:00Z",
  "description": "WARIS Sampoerna 10 gram × 1"
}
```

Successful response:

```json
{
  "orderId": "ORDER_UUID",
  "reference": "provider-unique-reference",
  "amount": 21000000,
  "currency": "IDR",
  "qrPayload": "000201..."
}
```

For `method: "va"`, provide `virtualAccount` instead of `qrPayload`. `qrPayload` is the actual QRIS text to encode, not an image URL. The bridge must durably deduplicate by order ID, return the same payment intent on retries/concurrent requests and honor the supplied expiration. Do not create a second charge when the application retries after a timeout. Reference, amount and currency are validated and bound to the order.

### Query status

`GET {PAYMENT_BRIDGE_URL}/payments/{encoded-reference}` returns:

```json
{
  "orderId": "ORDER_UUID",
  "reference": "provider-unique-reference",
  "amount": 21000000,
  "currency": "IDR",
  "status": "paid",
  "eventId": "stable-provider-paid-event-id",
  "paidAt": "2026-10-12T04:05:00Z"
}
```

Supported statuses are `pending`, `paid`, `expired`, `failed`, `cancelled`. A paid response requires a stable `eventId` and immutable `paidAt`. The query must read the provider's authoritative transaction record. The customer's confirmation button only calls this server-to-server query; it never sets an order paid based on a browser assertion.

### Payment webhook

Send a signed POST to `/functions/v1/payment-webhook`:

```json
{
  "eventId": "stable-provider-paid-event-id",
  "type": "payment.paid",
  "orderId": "ORDER_UUID",
  "reference": "provider-unique-reference",
  "amount": 21000000,
  "currency": "IDR",
  "paidAt": "2026-10-12T04:05:00Z"
}
```

Only paid events are accepted by this endpoint. Failed/expired transactions are surfaced by the status query. Refunds, chargebacks, cancellations after payment and reconciliation require the subsequent finance/stockpoint service; no reverse-commission automation is claimed here. If delivery arrives before the create-payment response has attached the reference, retry after the non-2xx response. Do not change the body of an existing event ID.

## Identity bridge

Configure `KYC_BRIDGE_URL`, `KYC_BRIDGE_TOKEN` and an independent `KYC_WEBHOOK_SECRET`. `POST {KYC_BRIDGE_URL}/verifications` uses `Idempotency-Key: <submission UUID>`:

```json
{
  "profileId": "AUTH_USER_UUID",
  "submissionId": "SUBMISSION_UUID",
  "fullName": "Name from submitted identity form",
  "phone": "+6281234567890",
  "ktpUrl": "https://...short-lived-private-signed-url...",
  "selfieUrl": "https://...short-lived-private-signed-url...",
  "consentAt": "2026-10-12T04:00:00Z"
}
```

Respond 2xx with a JSON acknowledgment only after durably accepting the request. Fetch the documents within five minutes, keep them private and honor provider data-handling/retention requirements. The bridge must return the same verification job for the same submission ID. It must verify actual identity/KTP/selfie; its acknowledgment does not approve the user. If no provider is configured, documents stay pending and the app reports that verification is unavailable.

Send signed results to `/functions/v1/kyc-webhook`:

```json
{
  "eventId": "stable-kyc-result-id",
  "type": "kyc.completed",
  "profileId": "AUTH_USER_UUID",
  "submissionId": "SUBMISSION_UUID",
  "status": "verified"
}
```

Use `status: "rejected"` with a short, customer-safe `reason` when rejected. Older submissions and already finalized results cannot overwrite a newer/current verified identity. Retrying `submit-kyc` is safe when the bridge honors its idempotency key.

## Signing normalized webhooks

Both bridge webhooks require:

- `x-sgi-timestamp`: Unix timestamp in seconds, within five minutes of server time.
- `x-sgi-signature`: lowercase hex HMAC-SHA256, optionally prefixed `sha256=`.
- HMAC input: the timestamp, a literal period, and the **exact raw JSON body** (`timestamp + "." + rawBody`). Do not reformat JSON after signing.

Example bridge-side Node.js signing:

```js
import { createHmac } from 'node:crypto';
const rawBody = JSON.stringify(event);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
  .update(`${timestamp}.${rawBody}`).digest('hex');
const headers = {
  'Content-Type': 'application/json',
  'x-sgi-timestamp': timestamp,
  'x-sgi-signature': signature,
};
```

HMAC signature verification uses WebCrypto rather than a JavaScript string comparison. SQL persists the event ID and body digest under a unique constraint, while the order/profile is locked, so a replay cannot duplicate commissions, reserve a second serial or alter a prior event. Retry with a newly signed timestamp and the same event body. Valid events return `{ "received": true }`.

## Settlement behavior and operational boundaries

- The server reads the product, current per-gram sell price, active stockpoint and available serial count. It rejects stale or sample prices by default. The authorized price feed is responsible for the agreed WARIS premium/pricing formula; this app does not invent a premium or fetch a live feed by itself.
- Checkout validates stock but does not reserve it before payment. The 15-minute payment intent is a quote; successful authoritative payment locks that quote and atomically reserves the requested serials using row locks. If simultaneous payments exhaust stock, the later payment becomes a finance exception, with no pickup token and no commissions, for allocation/refund review. Orders paid outside their quote window are also held for finance review.
- The server validates the payment reference, buyer order, whole-IDR amount, currency and payment timestamp. Changing product, price, total, tier or payment status in developer tools cannot make a valid payment.
- A paid and allocated one-time Classic purchase of at least 10 g grants Classic. A Premium purchase of at least 20 g grants Premium. Tier upgrades never downgrade an existing Premium member.
- `program_settings.commission_levels=1` is the default. Only own-purchase and first-upline rates are processed in that mode. An authorized operator can set `3` once the program is approved. Rates per recipient are Classic `[1, 0.75, 0.375, 0.1875]%`, Premium `[1.5, 1, 0.5, 0.25]%` for own, L1, L2, L3. Registered/unverified recipients do not earn and levels are never compressed around them.
- A checkout uses the account's locked referral attribution. No referral code means no commission posting, including own-purchase commission. The buyer's paid qualifying purchase is evaluated before their own-purchase commission eligibility. Confirm this interpretation with SGI before enabling payouts; changing it is a business-rule change, not a client-side toggle.
- The next payout display uses Jakarta calendar dates and the 20th. `payouts` and the commission ledger support a later finance process. This interface does not schedule bank transfers, produce a payout file, convert balances below Rp300,000 to grams, release stock at a counter or book buybacks. Those actions belong to the subsequent finance/stockpoint implementation and were not added as extra customer pages.
- There is no migration-created admin account or privileged public signup. Stockpoint imports, price updates, inventory reconciliation, payout processing, retention and support exception handling are trusted operator/backend work.

## Verification before real payments

Run these against a disposable Supabase project with test provider credentials:

1. Execute the migration and confirm anonymous direct reads of profiles/orders/ledger are denied; authenticated users cannot update tier, KYC, referral attribution or any order.
2. Upload KTP/selfie under two users. Check cross-user read/upload and overwriting submitted documents fail. Verify unconfirmed phone submission fails and referral reattribution fails.
3. Verify valid KYC results approve only the matching submission; wrong HMAC, stale timestamp and reused event ID with altered body fail.
4. Retry the same checkout concurrently; confirm one DB order and one provider intent. Reuse the key with a different basket and expect rejection.
5. Send valid and invalid payment events. Confirm mismatched amount/reference/currency fail, repeated paid events reserve once and commission rows remain unique.
6. Run two paid orders against one available serial. Confirm exactly one becomes ready and the other is a recorded exception; no duplicate serial allocation.
7. Check unqualified uplines receive nothing, single-level mode does not pay L2/L3, three-level mode uses each recipient's own tier, and a no-code account never posts commission.
8. Exercise QRIS, VA, expiration, provider outage, KYC rejection/resubmission, OTP phone change and a complete real test pickup handoff once its separate service exists.

Frontend tests alone do not establish that a real gateway, WhatsApp provider, KYC provider or hosted Supabase migration has been provisioned or passed these integration checks.

## Local database validation

Run `npm run test:db` to execute 16 PostgreSQL checks with PGlite: migration execution, RLS/access denial, KYC attribution, checkout qualification and idempotency, signed-event settlement, serial allocation, commission rates, and pickup privacy. The test supplies Auth/Storage schema stubs and pgcrypto compatibility functions; it does not validate hosted Supabase Auth, Storage APIs, or provider connectivity. Frontend/domain checks run with `npm test`. Edge security checks run with `deno test --allow-env supabase/tests/security.test.ts`.
