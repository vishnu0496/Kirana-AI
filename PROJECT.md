# Project: WhatsApp Inventory Bot Billing & Webhook Hardening

## Architecture
- **Framework**: Express.js with TypeScript (`tsx` execution).
- **Database**: Firestore (using `firebase-admin`).
- **Billing Route**: Razorpay webhook POST endpoint at `/api/webhook/razorpay` to handle subscription payments and activate accounts.
- **WhatsApp Gateway**: WhatsApp webhook POST/GET endpoints at `/api/webhook/whatsapp`.

## Milestones

### Implementation Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Razorpay Webhook Billing | Implement `/api/webhook/razorpay` POST endpoint, verify signature using `RAZORPAY_WEBHOOK_SECRET`, extract phone, find user, and upgrade billing to `"active"`. | None | IN_PROGRESS |
| M2 | WhatsApp Signature Verification | Protect `/api/webhook/whatsapp` POST endpoint with Meta payload signature verification using `WHATSAPP_APP_SECRET`. Reject unsigned or mismatching requests. | None | PLANNED |
| M3 | Webhook Idempotency Hardening | Verify and harden the message deduplication mechanism to ensure no duplicate processing of inventory operations occurs, even under concurrent requests. | None | PLANNED |
| M4 | Final Integration & Test Pass | Pass 100% of E2E tests and complete white-box adversarial coverage hardening. | M1, M2, M3, E2E | PLANNED |

### E2E Testing Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite | Design a comprehensive, opaque-box, requirement-driven E2E test suite covering feature coverage (Tier 1), boundary cases (Tier 2), cross-feature (Tier 3), and workloads (Tier 4). Publish `TEST_READY.md`. | None | IN_PROGRESS |

## Interface Contracts

### Razorpay Webhook Endpoint
- **Method**: `POST`
- **Path**: `/api/webhook/razorpay`
- **Headers**: `x-razorpay-signature` (HMAC hex digest using SHA256 of the raw body)
- **Response**:
  - `200 OK` for valid signatures and processed payment events.
  - `400 Bad Request` for invalid signature or malformed payload.

### WhatsApp Webhook Endpoint
- **Method**: `POST`
- **Path**: `/api/webhook/whatsapp`
- **Headers**: `x-hub-signature-256` (signature formatted as `sha256=<signature_hash>`)
- **Response**:
  - `200 OK` for successfully handled requests (including duplicate messages, which are skipped but return 200).
  - `400 Bad Request` or `401 Unauthorized` for invalid signature headers.

## Code Layout
- `server.ts` - Main Express server entry point.
- `src/database.ts` - Firestore helper functions.
- `src/billing.ts` - Billing state and access check logic.
- `src/parser.ts` - Intent parser.
- `src/templates.ts` - Multilingual reply templates.
- `scratch/` - Verification and utility scripts.
