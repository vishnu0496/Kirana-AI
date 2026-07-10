# Handoff Report — E2E Test Infra & Webhook Verification

This report outlines observations and proposals for setting up the E2E testing framework, environment, server lifecycle management, and webhook verification for KiranaAI Bot.

---

## 1. Observation

Direct observations from the codebase investigation:
- **Server Entrypoint**: `server.ts` imports modules and immediately registers middleware and routes.
  At line 44:
  ```typescript
  app.use(bodyParser.json());
  ```
  At line 450:
  ```typescript
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
  ```
  No server or app object is exported from `server.ts`.
- **Dependencies**: `package.json` doesn't contain test runners or assertion libraries. It runs as an ES module:
  ```json
  "type": "module"
  ```
- **Database Initialization**: `src/database.ts` lines 10-34 initializes Firebase Admin, checking `FIREBASE_SERVICE_ACCOUNT` or `service-account.json`. If neither is found, it initializes with a default project ID:
  ```typescript
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "ai-studio-applet-webapp-51469"
  });
  ```
- **Webhook Verifications**:
  - WhatsApp signatures use `x-hub-signature-256` header (Meta HMAC SHA256).
  - Razorpay signatures use `x-razorpay-signature` header (HMAC SHA256 hex digest of the raw body).
- **Existing Test Scratch Scripts**: `scratch/test-idempotency.ts` runs tests against a server already running on `http://localhost:3000`.

---

## 2. Logic Chain

1. **Test Runner Selection**:
   - Because `package.json` defines `"type": "module"` and runs TypeScript, any test runner must natively support ESM and TS.
   - Vitest runs ESM-native without translation layers (like ts-jest) and is extremely fast. Additionally, it has built-in module mocking (`vi.mock`), which is needed to mock external calls to `@google/generative-ai` and `axios` (used for sending WhatsApp messages).
   - Alternatively, Node.js native `node:test` can be run via `tsx --test` as a zero-dependency runner.

2. **Express Server Lifecycle Control**:
   - Because `server.ts` immediately starts listening on import (line 450) and does not export the `server` instance or `app`, testing it directly in-process is impossible without causing open handles.
   - There are two valid ways to control this:
     - **In-Process**: Refactor `server.ts` to export `app` and only listen conditionally if `process.env.NODE_ENV !== "test"`. Then tests can use `supertest(app)` or start/stop listeners on ephemeral ports.
     - **Out-of-Process**: Spawn the server as a child process using `tsx server.ts` and pass a randomly selected free port in `process.env.PORT`. Kill the process after tests.

3. **Database Isolation**:
   - Since `src/database.ts` initializes using `firebase-admin`, setting `FIRESTORE_EMULATOR_HOST` in the test environment variables will automatically redirect all database writes to a local Firestore emulator instance, preserving database isolation.

4. **Webhook Signature Verification**:
   - Because standard body parsing (`bodyParser.json()`) discards the raw body, calculating a signature HMAC in the route handler is impossible without preserving the raw body.
   - Therefore, the server must be configured with `verify` options to store `req.rawBody` as a buffer.
   - In E2E tests, raw payload strings must be signed using HMAC-SHA256 with the app/webhook secrets (`WHATSAPP_APP_SECRET` and `RAZORPAY_WEBHOOK_SECRET`) and sent in their respective headers (`x-hub-signature-256` and `x-razorpay-signature`).

---

## 3. Caveats

- **Gemini AI Mocking**: Out-of-process E2E testing cannot mock Gemini AI at the module level since it runs in a separate process. It would require network-level intercepts (e.g. `nock` or a local proxy server). In-process testing allows simple module mocking via Vitest.
- **Firestore Emulator**: We assume a Firestore emulator is already running or started as a global dependency before the test suite runs.

---

## 4. Conclusion

1. **Test Runner**: Propose **Vitest** for native ESM/TS support, rich assertions, and built-in mocking.
2. **Server Control**: Propose **In-Process Control** with `supertest` after refactoring `server.ts` to conditionally call `listen()`. It is faster, more robust, and simplifies mocking. Provide **Out-of-Process Control** as a fallback.
3. **Environment Setup**: Define local secrets and set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` to isolate testing. Use the Firestore REST API to clear collections between tests.
4. **Webhook signature verification**:
   - Preserves `req.rawBody` buffer in Express.
   - Compute signatures in tests using helper HMAC-SHA256 functions with `crypto` module.

---

## 5. Verification Method

To verify these observations:
1. Examine `server.ts` lines 44 and 450 to confirm lack of raw body capture and immediate `app.listen()`.
2. Inspect `src/database.ts` to verify firebase initialization conditions.
3. Check `package.json` to verify ESM configuration (`"type": "module"`).
4. Run `npx tsx scratch/test-idempotency.ts` or view `scratch/` files to verify developer expectations of a running port listener.
