# Changes made for Milestone E2E.1

## Files Created
- `TEST_INFRA.md` - E2E Testing Track Infrastructure and Scenario documentation at the project root.
- `tests/e2e/harness.ts` - Native Node-compatible test helper and harness that handles starting the mock WhatsApp server, spawning the Express server on an ephemeral port, seeding/clearing Firestore collections, and asserting database and outbound message state.
- `tests/e2e/tier1.test.ts` - Comprehensive E2E test file containing 45 happy-path test scenarios across the 9 system features using Node native runner (`node:test`) and assertions (`node:assert`).

## Files Modified
- `server.ts`
  - Parameterized the WhatsApp API base URL (`WHATSAPP_BASE_URL` env variable) to route outbound requests to the local mock WhatsApp server during E2E tests, reverting to Meta's production endpoint (`https://graph.facebook.com`) by default.
  - Verified body-parser `verify` configuration to populate `req.rawBody` for SHA256 HMAC verification (already present, ensured it remains clean and functional).
