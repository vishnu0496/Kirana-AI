# Original User Request

## 2026-07-10T04:36:02Z

# Teamwork Project Prompt

This project integrates a production-ready billing upgrade route using Razorpay payment webhooks with signature verification and hardens the WhatsApp webhook gateway against duplication and request spoofing.

Working directory: `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot`
Integrity mode: `development`

## Requirements

### R1. Razorpay Webhook Billing Integration
- Create a new POST endpoint at `/api/webhook/razorpay` that accepts Razorpay webhook events.
- Implement Razorpay webhook signature verification using the `x-razorpay-signature` header and a `RAZORPAY_WEBHOOK_SECRET` environment variable to ensure request authenticity.
- Upon receiving a verified `payment.captured` event, extract the customer's phone number (sent in notes or payload), locate their shop profile in Firestore, and upgrade their billing status to `"active"` (updating `activatedAt` to the current time).

### R2. WhatsApp Webhook Signature Verification
- Secure the existing `/api/webhook/whatsapp` POST endpoint from unauthorized request spoofing by validating Meta's signature headers (e.g., using `x-hub-signature-256` matching the SHA256 of the payload with the configured `WHATSAPP_APP_SECRET`).

### R3. Webhook Idempotency Validation
- Verify and harden the idempotency mechanism in the WhatsApp webhook handler to guarantee that redelivered or duplicate webhooks are processed at-most-once, preventing duplicate inventory transactions.

---

## Acceptance Criteria

### Security & Signature Checks
- [ ] Razorpay webhook validates signatures correctly; invalid signatures return `400 Bad Request` and valid signatures return `200 OK`.
- [ ] WhatsApp webhook validates signature headers; requests with missing or incorrect signature hashes are rejected.

### Billing Lifecycle
- [ ] Successful payments automatically transition a shop's status from `"trial"` or `"expired"` to `"active"` in Firestore.

### Verification & Testing
- [ ] A verification script in `scratch/test-razorpay-webhook.ts` is provided to simulate and verify signed Razorpay payments.
- [ ] The codebase compiles clean (`npm run lint`) with no TypeScript warnings or errors.
