# Scope: Razorpay Webhook Billing (Milestone 1)

## Architecture
- **Endpoint**: `/api/webhook/razorpay` (POST)
- **Signature Verification**: Validates the signature header `x-razorpay-signature` using HMAC hex digest with SHA256 of the raw body and the `RAZORPAY_WEBHOOK_SECRET` environment variable. Return `400 Bad Request` on mismatch.
- **Billing Update**: On `payment.captured` event:
  - Extract phone number from `notes.phone` or payload (e.g. `payload.payment.entity.notes.phone` or `payload.payment.entity.contact`).
  - Retrieve the user shop profile from Firestore (`shops/{phone}/profile/info`).
  - Update status to `"active"` and `activatedAt` to the current time.
  - Return `200 OK` on successful update.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1.1 | Razorpay Webhook Implementation | Implement POST `/api/webhook/razorpay`, signature verification, and billing update in Firestore. Create the verification script `scratch/test-razorpay-webhook.ts`. | None | PLANNED |
