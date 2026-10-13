# Frontend verification

The frontend-only conversion was checked with:

- `npm ci --offline`: pinned dependencies installed successfully; zero reported vulnerabilities.
- `npm test`: 19 frontend domain and demo workflow tests pass, including a complete registration/payment flow with all outbound requests blocked.
- `npm run build`: TypeScript checks and the production Vite bundle pass.

Tests cover qualification thresholds, commission levels, referral attribution, phone and sample-document validation, payout dates, consistent dashboard totals, pending checkout creation, idempotent confirmation, automatic demo verification, sign-out, and generated referral links that work across fresh demo instances without contact or identity data. Shared-link checks cover registered and qualified referrers, the three-level chain, subsequent generations, and malformed payload rejection. The application factory always creates the local interactive demo, with no environment-based configuration gate.

The conversion preserves the existing page structure, responsive layouts, palette and 10px minimum typography. Account document selection uses only synthetic images generated in the browser. Demo state is held in memory and resets on page reload.

No API integration or cloud account is required or exercised by these checks.
