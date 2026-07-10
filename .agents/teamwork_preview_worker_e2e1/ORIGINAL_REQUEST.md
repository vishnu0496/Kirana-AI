## 2026-07-10T04:40:34Z
You are the Worker for the E2E Testing Track of KiranaAI Bot.
Your working directory is: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_worker_e2e1\
Please read c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\PROJECT.md and c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_e2e\SCOPE.md.
Also review the analysis and handoff reports from the 3 Explorers:
- Explorer 1 (Mocks & Runner): c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_e2e1_1\analysis.md
- Explorer 2 (DB & Onboarding): c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_e2e1_2\analysis.md
- Explorer 3 (Tier 1 Cases): c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_e2e1_3\analysis.md

Your task is to implement Milestone E2E.1: Test Infra & Tier 1.

Follow these instructions precisely:
1. Create `TEST_INFRA.md` at the project root based on the E2E Testing Track Principles and E2E Test Infra template from the Project Pattern.
2. Refactor `server.ts` slightly to support E2E testing:
   - Configure Express body-parser to store the raw body in `req.rawBody` buffer (e.g. by adding a `verify` option to `bodyParser.json()`), which is required for signature verification of WhatsApp and Razorpay webhooks.
   - Replace the hardcoded WhatsApp Cloud API URL `https://graph.facebook.com` with `process.env.WHATSAPP_BASE_URL || "https://graph.facebook.com"`.
3. Set up the E2E testing environment and runner:
   - We will use Node.js native test runner `node:test` (run via `npx tsx --test`) as a zero-dependency, ESM-compatible test runner.
   - Create a test helper/harness file at `tests/e2e/harness.ts` that:
     - Spawns/starts the Express server on an ephemeral port.
     - Starts a simple mock HTTP server in-process to capture outbound requests from the server to WhatsApp API (using `process.env.WHATSAPP_BASE_URL`).
     - Isolates Firestore database by setting `process.env.FIRESTORE_EMULATOR_HOST` to a local emulator (or a test database ID if emulator is not running).
     - Exposes helper functions to clear the database (using `recursiveDelete` or emulator DELETE endpoint), seed mock data (like users, stocks, billing state), send webhook POST requests (WhatsApp / Razorpay), compute webhook HMAC-SHA256 signatures, and assert outcomes.
4. Implement all 45 Tier 1 E2E test cases (5 happy path cases per feature for all 9 features) in `tests/e2e/tier1.test.ts`. Use native `node:test` and `node:assert`.
5. Run the tests. Since some features (like Razorpay webhook or WhatsApp signature verification) might not be fully implemented yet, the tests for those features may fail. That is expected. Ensure that the tests themselves run correctly, compile, and output clear failures for missing features and success for implemented ones.
6. Write a detailed report of your work to `changes.md` and `handoff.md` in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
