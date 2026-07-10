# E2E Test Infrastructure & Specification

This document details the test infrastructure, principles, environment setup, and test suite matrix for the KiranaAI Bot End-to-End (E2E) testing track.

---

## 1. E2E Testing Track Principles

- **Opaque-Box Testing**: The test suite must test the system externally by invoking the HTTP webhook endpoints and asserting outcomes via database state changes and outbound WhatsApp API calls. Tests must not inspect internal code variables, helpers, or states directly.
- **Requirement-Driven**: Every test case directly correlates to a specific business scenario or system feature requirement.
- **Environment Isolation**: Tests must run against isolated database instances (Firestore Emulator) and mocked external interfaces (WhatsApp Cloud API) to ensure zero data pollution and deterministic behavior.
- **Zero Hardcoded Assertions**: Test assertions must evaluate real state changes and dynamic values. Hardcoding expected results, pre-calculated signature responses, or fake success indicators is strictly prohibited.
- **Consistent Cleanup**: The test harness must wipe the database and clear outgoing request queues between test cases to ensure perfect test case independence.

---

## 2. Test Architecture

The E2E test setup consists of the following components:

```
                  +--------------------------------+
                  |      Node.js Test Runner       |
                  |          (node:test)           |
                  +---------------+----------------+
                                  |
            Spawns/HTTP POSTs     |  Reads & Seeds
                                  v
+-----------------------+   HTTP Webhooks   +------------------------+
|   Express.js Server   +------------------>+  Mock WhatsApp Server  |
|      (server.ts)      |  (WHATSAPP_BASE)  |  (In-Process Harness)  |
+-----------+-----------+                   +------------------------+
            |
            | Reads / Writes
            v
+-----------------------+
|  Firestore Emulator   |
|   (localhost:8080)    |
+-----------------------+
```

### Server Lifecycle Control
The Express server is spawned as a child process using `npx tsx server.ts` inside a global setup block. It runs on a dynamically allocated (ephemeral) port to prevent address-in-use conflicts.

### Mock WhatsApp Server
An in-process HTTP mock server captures all outbound messages sent by the Express server to `process.env.WHATSAPP_BASE_URL`. These requests are queued in memory, enabling test assertions to verify that correct templates, languages, and items are sent to the correct recipient.

### Database Isolation
The Firebase Admin SDK is forced to connect to a local Firestore emulator by setting `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. Between test cases, the harness wipes the emulator database using the REST API.

---

## 3. Environment Configuration

The following environment variables are initialized during E2E test execution:

```env
NODE_ENV="test"
PORT=0 # Ephemeral port selection
FIREBASE_PROJECT_ID="kirana-bot-test"
FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
FIREBASE_FIRESTORE_DATABASE_ID="kirana-inventory-db-test"
WHATSAPP_BASE_URL="http://127.0.0.1:<mockPort>"
WHATSAPP_APP_SECRET="test_whatsapp_secret"
RAZORPAY_WEBHOOK_SECRET="test_razorpay_secret"
GEMINI_API_KEY="test_gemini_key"
WHATSAPP_TOKEN="test_whatsapp_token"
WHATSAPP_PHONE_NUMBER_ID="1234567890"
WHATSAPP_VERIFY_TOKEN="KIRANA_SECRET"
```

---

## 4. Test Suite Matrix (45 Tier 1 Cases)

Tier 1 includes 5 happy path scenarios for each of the 9 core features:

1. **Onboarding**: Conversational onboarding flows for English, Telugu, and Hindi users.
2. **WhatsApp Signatures**: Verification of Meta headers (`x-hub-signature-256`) and sub verification.
3. **Webhook Idempotency**: Deduplication of messages to avoid duplicate processing.
4. **Razorpay Billing**: Upgrades shop profile billing status from trial to active.
5. **Inventory ADD/SELL/Fuzzy**: Basic inventory changes and fuzzy merging.
6. **Price Queue**: Prompts and queue handling for new inventory item price setup.
7. **Queries & Reports**: Alphabetic stock list rendering and today's sales report calculations.
8. **Low Stock Alerts**: Automatic low-stock warnings during sell-offs and stock queries.
9. **Language Detection**: Dynamic language detection and switching from English to Telugu/Hindi.

---

## 5. Execution Command

To execute the entire E2E test suite, run:

```bash
npx tsx --test tests/e2e/tier1.test.ts
```
