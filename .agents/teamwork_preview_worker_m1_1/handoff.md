# Handoff Report: Razorpay Webhook Billing Integration (Milestone 1)

## 1. Observation
- Modified `server.ts` to support raw body capture via `bodyParser.json` verify callback and implemented signature verification and webhook logic:
  - File: `server.ts`
  - Modification: Added imports for standard `crypto` library and `setBillingStatus` from `./src/database`.
  - Added POST route `/api/webhook/razorpay` that decodes signature header `x-razorpay-signature`, computes HMAC-SHA256 of `req.rawBody` using `process.env.RAZORPAY_WEBHOOK_SECRET`, compares the two via `crypto.timingSafeEqual` (after checking lengths), validates the `payment.captured` event, extracts the contact/phone number from notes or contact, retrieves the shop profile via `getUser(phone)`, and updates the shop status to active via `setBillingStatus(phone, "active")`.
- Created test script `scratch/test-razorpay-webhook.ts` that spins up a test profile in Firestore, resets status, constructs mock webhook payloads for four test scenarios, generates HMAC signatures, sends HTTP POST requests to `http://localhost:3000/api/webhook/razorpay`, and asserts correct HTTP responses and Firestore status updates.
- Executed `npm run lint` which successfully executed without type errors:
```
> kirana-ai@0.0.0 lint
> tsc --noEmit
```
- Started server using `$env:RAZORPAY_WEBHOOK_SECRET="test_secret"; npx tsx server.ts` and executed `npx tsx scratch/test-razorpay-webhook.ts` producing the following output:
```
==========================================
🧪 TESTING RAZORPAY WEBHOOK INTEGRATION
==========================================
[PRE-TEST] Preparing Firestore for shop: 919999999999
[PRE-TEST] Shop profile does not exist. Creating dummy shop profile...
[PRE-TEST] Reset billing status of 919999999999 to "trial"

🚀 Running Test Case 1: Valid signature, event payment.captured (using notes.phone)...
Response Status: 200
Response Data: { success: true }
✅ Test Case 1 PASSED: Firestore billing status is active!

🚀 Running Test Case 2: Invalid signature...
✅ Test Case 2 PASSED: Correctly rejected with status 400 Bad Request

🚀 Running Test Case 3: Ignored event (payment.failed)...
Response Status: 200
Response Data: { status: 'ignored', event: 'payment.failed' }
✅ Test Case 3 PASSED: Firestore billing status remained trial!

🚀 Running Test Case 4: Non-existent shop phone...
✅ Test Case 4 PASSED: Correctly returned 404 Not Found

==========================================
🎉 ALL TESTS PASSED SUCCESSFULLY!
==========================================
```
- Background server task logged details matching these requests:
```
Server running on port 3000
[RAZORPAY WEBHOOK SUCCESS] Activated billing for shop: 919999999999
[RAZORPAY WEBHOOK ERROR] Signature verification failed
[RAZORPAY WEBHOOK] Event ignored: payment.failed
[RAZORPAY WEBHOOK ERROR] Shop not found for phone: 918888888888
```

## 2. Logic Chain
- Standard body-parser configuration was modified in `server.ts` to retain a raw body buffer on `req.rawBody` for webhook verification.
- In `server.ts`, the new endpoint `/api/webhook/razorpay` verifies incoming webhooks:
  1. Computes the HMAC-SHA256 signature using `process.env.RAZORPAY_WEBHOOK_SECRET` and `req.rawBody`.
  2. Compares the signatures safely using `crypto.timingSafeEqual` (by checking length first, returning `400` on mismatch, which matches the behavior verified in Test Case 2).
  3. Validates the event type; only `payment.captured` triggers upgrades. Non-captured events (e.g. `payment.failed`) return `200` without modifying the database (verified in Test Case 3).
  4. Decodes notes/contact info to extract the customer's phone number, normalizing it to digits. Prepend "91" if a 10-digit number is captured to align with international formats.
  5. Queries the database using `getUser`. Returns `404` if the shop does not exist (verified in Test Case 4).
  6. Updates billing status using `setBillingStatus(phone, "active")` (verified in Test Case 1).
- The test script `scratch/test-razorpay-webhook.ts` validates these exact assertions end-to-end against a running local instance.

## 3. Caveats
- No caveats. The script performs full end-to-end integration tests using a local Express instance and real Firestore collections.

## 4. Conclusion
- The Razorpay Webhook Billing Integration is successfully implemented and fully verified.
- The webhook successfully and securely updates a shop's billing status to active when a valid payment captured event arrives.

## 5. Verification Method
1. Start the server locally with a test webhook secret:
   ```powershell
   $env:RAZORPAY_WEBHOOK_SECRET="test_secret"
   npx tsx server.ts
   ```
2. In a separate terminal shell, run the webhook integration test script:
   ```powershell
   npx tsx scratch/test-razorpay-webhook.ts
   ```
3. Observe that all 4 test cases output PASSED status messages and Firestore billing attributes are updated correctly.
4. Run code compilation verification:
   ```powershell
   npm run lint
   ```
   Ensure no compilation issues or type errors occur.
