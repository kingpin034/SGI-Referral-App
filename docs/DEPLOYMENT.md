# Deploy the interactive frontend

This project is a static React/Vite application. The same browser-only demo works locally, on Vercel Preview and on Vercel Production. There are no backend services, credentials, environment variables or separate deployment steps.

## Vercel project settings

Import this repository in Vercel with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `.` if this folder is the repository root; otherwise `SGI-Referral-App` |
| Framework Preset | Vite |
| Node.js | 22.12 or newer |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | None |

`vercel.json` supplies the build settings, route fallback and response headers. Direct links such as `/catalog`, `/account`, `/catalog/orders`, `/referral/network` and `/?ref=SG-ANDI28` load the application correctly.

If replacing an older deployment, remove its unused environment variables in the Vercel project settings and redeploy. The current app does not read any of them.

## Verify before publishing

```sh
npm ci
npm test
npm run build
npm run preview
```

Open the preview URL printed by Vite. Check referral filters, product checkout, both payment examples, order receipts and account registration with OTP `123456`. Every payment and identity-verification step is explicitly simulated; no transaction or message leaves the browser.

The app starts with a sample member. Opening a referral URL starts the sample onboarding flow. Data changes are memory-only and reset on reload. The deployed frontend is ready for interactive presentations without further configuration.
