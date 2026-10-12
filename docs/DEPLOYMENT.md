# Deploy the reseller and buyer application

Vercel hosts the static React/Vite app. Supabase hosts authentication, Postgres, private identity storage and Edge Functions. Payment and KYC providers connect through authenticated bridge endpoints; their credentials remain on the server.

This is the first independent application. Select **SGI-Referral** as the Vercel project root when your Git repository contains that directory. If this directory is the repository root, select `.`. The stockpoint and admin applications will use separate roots and deployments.

## 1. Configure Supabase

Create the intended Supabase project and install the Supabase CLI using the official instructions. Before receiving real identities, confirm that the chosen database, storage, backups and provider processing meet the client's Indonesia-hosting requirement; this repository does not configure or attest to deployment residency.

From `SGI-Referral`, link the intended project and apply the included migration:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review the target project and migrations before pushing. The migration creates the catalogue, private `identity-documents` bucket, database functions, row-level access controls and default commission settings. It seeds a **sample** price, no real stockpoints and no serialized inventory.

In **Authentication**, enable phone sign-in and configure a provider that supports WhatsApp OTP. This app calls Supabase Auth with `channel: 'whatsapp'`; there is no browser environment variable for changing that channel. Supabase currently documents WhatsApp support through Twilio and Twilio Verify. Configure the sender and templates with your chosen provider. See [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login).

Set the hosted app URL in Supabase Auth's Site URL and allowed redirect URLs. For local testing, add the exact origin printed by Vite, normally `http://127.0.0.1:4174`. The checked-in local Supabase config contains localhost defaults; update it if running the local Supabase stack with a different origin.

## 2. Configure the provider bridges and secrets

Implement or connect bridges that satisfy [the backend contracts](BACKEND.md). Vendor-native payloads are not assumed to match these contracts automatically.

Set the following in **Supabase Edge Function secrets**, not Vercel's public frontend variables:

| Secret | Value |
| --- | --- |
| `APP_ORIGINS` | Comma-separated exact frontend origins, for example `https://your-app.vercel.app,http://127.0.0.1:4174`; no trailing slashes or wildcard origins |
| `PAYMENT_BRIDGE_URL` | HTTPS base URL of the payment bridge |
| `PAYMENT_BRIDGE_TOKEN` | Server-to-server bearer token for the payment bridge |
| `PAYMENT_WEBHOOK_SECRET` | Secret used to sign payment webhook events |
| `KYC_BRIDGE_URL` | HTTPS base URL of the KYC bridge |
| `KYC_BRIDGE_TOKEN` | Server-to-server bearer token for the KYC bridge |
| `KYC_WEBHOOK_SECRET` | Secret used to sign KYC webhook events |

Supabase-hosted Edge Functions supply `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in their runtime. Keep the service-role key out of the frontend, repository and any `VITE_*` variable. For local Edge Function testing, provide the equivalent local runtime values.

Use the Supabase dashboard to enter secrets or create an ignored local file such as `supabase/.env.local` and run:

```sh
supabase secrets set --env-file supabase/.env.local
```

The existing `.gitignore` excludes `.env.local` files. Never commit a populated secrets file. Supabase documents both dashboard and CLI secret configuration in [Environment variables](https://supabase.com/docs/guides/functions/secrets).

Deploy the five functions:

```sh
supabase functions deploy create-checkout
supabase functions deploy sync-payment
supabase functions deploy submit-kyc
supabase functions deploy payment-webhook
supabase functions deploy kyc-webhook
```

The checked-in `supabase/config.toml` disables the platform JWT check for these functions. The first three functions independently authenticate the bearer token using `auth.getUser()`. Webhooks require a timestamped HMAC signature and reject unsigned requests. Preserve these application checks. Supabase reads function-specific deployment settings from that file; see [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy).

Configure your bridges to deliver signed events to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook
https://YOUR_PROJECT_REF.supabase.co/functions/v1/kyc-webhook
```

Webhook bodies, signature headers, idempotency rules and retry behavior are specified in [BACKEND.md](BACKEND.md).

## 3. Load the operating data

Using a trusted server integration or a restricted administrative connection:

1. Maintain `gold_prices` with the approved sell and buyback prices per gram, `source='live'`, and a current `updated_at`. Checkout rejects a feed older than 24 hours. The import must implement SGI's approved pricing formula; this application does not fetch Waris prices itself.
2. Add the real pickup locations to `stockpoints`.
3. Import actual serialized units into `serial_inventory`, associated with the matching product and stockpoint. Catalogue product IDs are `waris-05g`, `waris-1g`, `waris-5g` and `waris-10g`.
4. Keep `program_settings.allow_sample_checkout=false` for production. The default `commission_levels=1` restricts earned overrides to the first upline. Set it to `3` only when SGI approves activating that program configuration.

The server verifies qualification, pricing, available stock and attribution. Payment settlement allocates serialized inventory, creates the pickup token and posts eligible commissions in one database transaction. A missing or stale price feed, unconfigured bridge or unavailable stock is an actionable error, not a simulated successful purchase.

The original stockpoint, finance, payout and inventory workflows will connect through the other standalone applications. This deployment does not add those screens or run scheduled bank payouts.

## 4. Configure Vercel

Import the Git repository in Vercel and use these project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `SGI-Referral` within a parent repository, otherwise `.` |
| Framework Preset | Vite |
| Node.js | A supported Node 22 release at least 22.12, or a compatible newer supported version |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`vercel.json` already supplies the build command, output directory, SPA fallback and response headers. The fallback permits directly opening a referral URL. Vercel supports Vite deployments and project environment variables; see [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

Set these frontend environment variables for the intended Vercel environment:

| Variable | Production value |
| --- | --- |
| `VITE_SUPABASE_URL` | The project's HTTPS Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anon key or supported publishable key, never the service-role key |
| `VITE_ENABLE_SANDBOX` | `false` |

These are compiled into the browser build. Redeploy after changing them. Keep preview and production environment values separate. Add the final production origin and each authorized preview origin to `APP_ORIGINS`; arbitrary Vercel preview subdomains are not automatically allowed.

### Mode selection

The current repository uses these rules, in this order:

1. If both Supabase URL and public key are non-empty, use Supabase. This wins even if sandbox is set to `true`.
2. Otherwise use the sandbox when `VITE_ENABLE_SANDBOX=true`, or in the Vite development server when the variable is not explicitly `false`.
3. Otherwise use the unconfigured state. A production build never silently falls back to sandbox unless sandbox was explicitly enabled.

For a clearly labelled demo deployment, leave both Supabase values blank and set `VITE_ENABLE_SANDBOX=true` in the **Preview** environment. Sandbox data is memory-only, resets on reload, uses synthetic identity documents and never makes a real payment. Do not point a sandbox-preview build at production Supabase credentials, because that would select Supabase mode instead.

## 5. Validate the deployed integrations

Run the local checks before building:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Then verify the following against a dedicated Supabase test environment and provider test accounts:

- Direct referral links preserve the intended attribution through WhatsApp OTP and KYC.
- Uploaded documents remain private; only the owner and trusted verification integration can access them.
- Signed KYC callbacks move pending accounts to verified or rejected, and repeated callbacks do not corrupt state.
- QRIS and virtual-account creation return genuine provider test details. Payment confirmation checks gateway state; an unpaid order stays pending.
- Duplicate payment events allocate serials and commissions once. Amount/reference mismatches, expired payments and unavailable stock follow the documented exception path.
- Buyers see their own pickup QR; upstream partners do not receive another buyer's pickup secret.
- Page refreshes on referral links work, and the three approved navigation sections remain usable on a small mobile screen.
- Missing environment variables and unavailable integrations show clear errors without sample transactions appearing as live data.

Browser unit tests do not provision Supabase or validate real vendor behavior. Complete the database and provider integration checks before enabling real identity submission and payment collection. Hosting configuration alone does not connect the external services.

Run `npm run test:db` for the included local PostgreSQL migration and authorization checks. See [backend validation details](./BACKEND.md).
