# Handoff Report: Razorpay Webhook Billing Integration Review (Milestone 1)

This report details the quality and adversarial review of the Razorpay Webhook Billing Integration implemented in Milestone 1.

---

## 1. Observation

We performed code reviews, ran compilation checks, and executed the validation scripts. Here are our direct observations:

### A. Compilation Failure
When running the lint check (`npm run lint` which runs `tsc --noEmit`), the compiler failed with the following diagnostic:
```
> kirana-ai@0.0.0 lint
> tsc --noEmit

tests/e2e/tier1.test.ts(214,25): error TS2304: Cannot find name 'axios'.
```
This compilation error is located in `tests/e2e/tier1.test.ts` on line 214:
```typescript
214:       const res = await axios.get(`http://127.0.0.1:${harness.serverPort}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=KIRANA_SECRET&hub.challenge=1158201444`);
```
No import for `axios` is present at the top of `tests/e2e/tier1.test.ts`.

### B. Razorpay Webhook Implementation (`server.ts`)
The webhook handler is defined on lines 52-136 in `server.ts`:
```typescript
app.post("/api/webhook/razorpay", async (req: any, res: any) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[RAZORPAY WEBHOOK ERROR] RAZORPAY_WEBHOOK_SECRET is not configured.");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    console.warn("[RAZORPAY WEBHOOK ERROR] Missing x-razorpay-signature header");
    return res.status(400).json({ error: "Missing signature header" });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn("[RAZORPAY WEBHOOK ERROR] Missing rawBody");
    return res.status(400).json({ error: "Missing raw body" });
  }

  // Compute HMAC SHA256 of the raw body
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Timing-safe verification converting signatures to buffers of equal length first
  const computedBuffer = Buffer.from(computedSignature, "hex");
  const expectedBuffer = Buffer.from(signature, "hex");

  if (computedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(computedBuffer, expectedBuffer)) {
    console.warn("[RAZORPAY WEBHOOK ERROR] Signature verification failed");
    return res.status(400).json({ error: "Signature verification failed" });
  }

  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: "Malformed payload: missing body" });
    }

    if (payload.event !== "payment.captured") {
      console.log(`[RAZORPAY WEBHOOK] Event ignored: ${payload.event}`);
      return res.status(200).json({ status: "ignored", event: payload.event });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      return res.status(400).json({ error: "Malformed payload: missing payment entity" });
    }

    const rawPhone = payment.notes?.phone || payment.contact;
    if (!rawPhone) {
      return res.status(400).json({ error: "No phone number found in notes or contact" });
    }

    // Strip all non-digit characters to normalize
    const phone = rawPhone.replace(/\D/g, "");
    if (!phone) {
      return res.status(400).json({ error: "Invalid contact or phone number format" });
    }

    // Verify if the shop profile exists in Firestore (retrieve via getUser(phone)).
    let targetPhone = phone;
    let shopProfile = await getUser(targetPhone);
    
    // Check if 10-digit phone number needs 91 prepending
    if (!shopProfile && phone.length === 10) {
      targetPhone = "91" + phone;
      shopProfile = await getUser(targetPhone);
    }

    if (!shopProfile) {
      console.warn(`[RAZORPAY WEBHOOK ERROR] Shop not found for phone: ${targetPhone}`);
      return res.status(404).json({ error: "Shop profile not found" });
    }

    // Update the shop's billing status to "active"
    await setBillingStatus(targetPhone, "active");
    console.log(`[RAZORPAY WEBHOOK SUCCESS] Activated billing for shop: ${targetPhone}`);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[RAZORPAY WEBHOOK ERROR] Failed to process database update:", err.message);
    return res.status(500).json({ error: "Database error or processing error" });
  }
});
```

### C. Verification Script Run (`scratch/test-razorpay-webhook.ts`)
Running the validation script with `RAZORPAY_WEBHOOK_SECRET` set in the environment yielded:
```
==========================================
🧪 TESTING RAZORPAY WEBHOOK INTEGRATION
==========================================
[PRE-TEST] Preparing Firestore for shop: 919999999999
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

### D. Missing Configuration Template
We observed that `RAZORPAY_WEBHOOK_SECRET` is not declared or documented in `.env.example`.

---

## 2. Logic Chain

1. **Compilation Check**: The compilation run (`tsc --noEmit` / `npm run lint`) fails strictly on the `tests/e2e/tier1.test.ts` file. Line 214 uses `axios.get()`, but `axios` is not imported anywhere in that file. Therefore, compiling the project out-of-the-box fails.
2. **Webhook Behavior Verification**: Running `test-razorpay-webhook.ts` validates that the webhook endpoint operates correctly *if and only if* `RAZORPAY_WEBHOOK_SECRET` is available.
3. **Missing Variable In Example**: Because `RAZORPAY_WEBHOOK_SECRET` is missing in `.env.example`, developers performing local setups will run into 500 errors on the webhook endpoint since the server defaults to returning a 500 when `RAZORPAY_WEBHOOK_SECRET` is unset.
4. **Signature Safety**: Converting both the computed and input signatures to buffers (`Buffer.from(..., 'hex')`) is correct because `Buffer.from` parses hex representations case-insensitively. The early length comparison protects against throwing a TypeError in `crypto.timingSafeEqual`, which requires equal-length buffers.

---

## 3. Caveats

- We assumed that the local Firestore emulator is not running in the development workspace. The verification script succeeded because it fell back to using the configured cloud database `kirana-inventory-db` (via default project settings).
- We did not modify any files (including adding the missing `axios` import in `tests/e2e/tier1.test.ts`) because our role is strictly review-only.

---

## 4. Conclusion

### Review Verdict: REQUEST_CHANGES

The Razorpay Webhook Billing Integration is logically correct, robust, and secure. However, we request changes to resolve a compilation failure in the test suite and minor setup/robustness gaps.

---

### Quality Review Report

#### Major Finding 1: E2E Test Suite Compilation Failure
- **What**: The compiler cannot find the name `axios`.
- **Where**: `tests/e2e/tier1.test.ts` (line 214)
- **Why**: The file uses `axios.get` but does not import `axios`. This causes `npm run lint` / `tsc --noEmit` to fail, blocking CI/CD pipelines.
- **Suggestion**: Add `import axios from "axios";` to the imports at the top of `tests/e2e/tier1.test.ts`.

#### Minor Finding 2: Missing Setup Configuration
- **What**: `RAZORPAY_WEBHOOK_SECRET` is not documented.
- **Where**: `.env.example`
- **Why**: Developers setting up the project locally will be unaware they need to configure this environment variable, leading to unexpected `500 Webhook secret not configured` errors when trying to test webhook routes.
- **Suggestion**: Add `# RAZORPAY_WEBHOOK_SECRET: Secret key for verifying Razorpay webhook signatures` and `RAZORPAY_WEBHOOK_SECRET="test_razorpay_secret"` to `.env.example`.

#### Verified Claims
- **Webhook signature verification** → verified via `test-razorpay-webhook.ts` (Test Case 2) → **PASS**
- **Billing status upgrade to "active"** → verified via `test-razorpay-webhook.ts` (Test Case 1) → **PASS**
- **Graceful filtering of unhandled webhook events** → verified via `test-razorpay-webhook.ts` (Test Case 3) → **PASS**
- **Rejection of non-existent shop phone** → verified via `test-razorpay-webhook.ts` (Test Case 4) → **PASS**

---

### Adversarial Challenge Report

**Overall Risk Assessment**: LOW (Minor implementation recommendations only)

#### Challenges

##### [Minor] Challenge 1: Unhandled Body Parser Exception
- **Assumption challenged**: Raw body parser is assumed to always receive correctly formatted JSON.
- **Attack scenario**: An attacker posts malformed or corrupt JSON data to `/api/webhook/razorpay` or `/api/webhook/whatsapp`.
- **Blast radius**: Express's default error handler catches JSON parsing errors and prints a stack trace directly back in the HTML response, leaking internal server directories and framework versions.
- **Mitigation**: Add a global error-handling middleware at the end of `server.ts` to capture JSON parse errors and return a clean, non-leaking JSON error response:
  ```typescript
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && "status" in err && err.message.includes("JSON")) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    next(err);
  });
  ```

##### [Low] Challenge 2: Length Verification Fast-Return Timing Leak
- **Assumption challenged**: Comparison is completely timing-safe.
- **Attack scenario**: Measuring response times to guess the length of the expected signature.
- **Blast radius**: Practically none. The length check `computedBuffer.length !== expectedBuffer.length` will fast-return if the signature is not 64 hex characters (32 bytes). However, since the signature length is always exactly 32 bytes (for SHA-256 HMAC), this leaks no private information.
- **Mitigation**: Standardize signature validation to always verify the length is 32 bytes before proceeding. (The current implementation is acceptable since the secret-dependent buffer length is constant).

---

## 5. Verification Method

To independently verify this review:
1. Run `npm run lint` or `npx tsc --noEmit` in the project root to reproduce the compilation error.
2. Verify the webhook logic locally:
   - Ensure port 3000 is free.
   - Start the server with a dummy secret:
     ```powershell
     $env:RAZORPAY_WEBHOOK_SECRET="test_secret"; npx tsx server.ts
     ```
   - In a separate terminal, execute the test script:
     ```powershell
     $env:RAZORPAY_WEBHOOK_SECRET="test_secret"; npx tsx scratch/test-razorpay-webhook.ts
     ```
   - Confirm all 4 test cases output `✅ ... PASSED` and print `🎉 ALL TESTS PASSED SUCCESSFULLY!`.
