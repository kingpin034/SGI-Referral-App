# Sampoerna Gold — Reseller & Buyer

A mobile-first interactive frontend by Newtn Technology. Every build runs entirely in the browser with sample data, including a Vercel production deployment. No database, authentication service, payment connection, API keys, or environment variables are required.

## Application structure

The supplied information architecture is preserved:

- **Referral:** tier, referral sharing, campaign banner, performance filters, totals, payout date, referral transactions and three-level partner network.
- **Gold Catalog:** sample sell/buyback prices, 0.5 / 1 / 5 / 10 gram products, partner CTA, My Orders, two-step checkout and pickup receipt.
- **Account / referral landing:** synthetic e-KTP and selfie, name, sample WhatsApp number, demo OTP, referral code, pending verification, verified profile and sign-out.

Brand colors are red `#B72731`, gold `#C3A753`, black `#1C1C1C` and white `#FFFFFF`. The minimum text size is 10px. There is no role switcher or additional page structure.

## Run locally

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:4174`. Use an HTTP preview rather than opening `index.html` directly.

## Try the interactive flows

The app starts with the sample Premium account **Andi Pratama**. Explore referral charts, filters, order pagination, network levels, share links and the gold catalogue.

Open `/?ref=SG-ANDI28` to try registration. Use **Gunakan contoh** for synthetic KTP/selfie images, enter a made-up name and Indonesian phone number, request an OTP and enter **123456**. The simulated verification completes after approximately four seconds. To return to Andi after signing out, use **081234567890** and OTP **123456**.

Checkout supports QRIS and Virtual Account examples. **Konfirmasi pembayaran demo** creates a sample pickup receipt and updates the account's orders, qualification and commission totals. Neither the QR nor the virtual account receives money, and no WhatsApp message is sent.

New accounts can share a demo referral link that works in a fresh tab. The link carries only generated referral codes and their tier snapshot, so the next registration and three-level commission example can resolve without shared storage. Copy a new link after changing tiers; previously copied links retain their demo snapshot.

All changes remain in memory and reset when the page reloads. Identity files cannot be uploaded; the document buttons generate synthetic examples. No customer information is sent to an external service or saved to local storage.

## Check and deploy

```sh
npm test
npm run build
npm run preview
```

Vercel settings and direct-route support are included. See [Deployment](docs/DEPLOYMENT.md). No `.env` file is needed.

## Repository layout

```text
src/components/       Pages, list views and modals
src/lib/              Demo data, local interactions, types and business rules
public/assets/        Product assets and attribution
tests/               Frontend workflow and business-rule checks
docs/                Deployment and verification notes
vercel.json           Static build, route fallback and response headers
```
