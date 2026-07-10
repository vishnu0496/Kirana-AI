# Handoff Report: Razorpay Webhook Billing Integration (Milestone 1)

This report details the findings and implementation design for the Razorpay Webhook Billing Integration (Milestone 1) in the WhatsApp Inventory Bot project.

---

## 1. Observation

### Codebase Environment & Settings
*   **Backend Framework**: Express.js with TypeScript (`tsx` execution runner).
    *   `package.json` line 7-8: `"dev": "tsx server.ts"`, `"start": "tsx server.ts"`.
    *   `package.json` lines 18 & 20: `"express": "^4.21.2"`, `"tsx": "^4.21.0"`.
*   **Package Manager**: `npm` (evidenced by `package-lock.json` in the root).
*   **Firestore Client / SDK**: `firebase-admin` (v13.8.0).
    *   `src/database.ts` lines 10-34 initialized Firebase:
        ```typescript
        const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";
        db = getFirestore(admin.app(), firestoreDatabaseId);
        ```
    *   Firestore document path for shop profile is `shops/{phone}/profile/info`.
*   **Existing Database Helpers**:
    *   `src/database.ts` lines 229-243 contains `setBillingStatus`:
        ```typescript
        async function setBillingStatus(phone: string, status: "trial" | "active" | "expired") {
          const billing = await getBilling(phone);
          const profileRef = db.collection("shops").doc(phone).collection("profile").doc("info");
          
          const updatedBilling: any = {
            ...billing,
            status
          };
          
          if (status === "active") {
            updatedBilling.activatedAt = admin.firestore.Timestamp.now();
          }
          
          await profileRef.set({ billing: updatedBilling }, { merge: true });
        }
        ```
    *   `src/database.ts` lines 38-42 contains `getUser`:
        ```typescript
        async function getUser(phone: string) {
          const profileRef = db.collection("shops").doc(phone).collection("profile").doc("info");
          const doc = await profileRef.get();
          return doc.exists ? doc.data() : null;
        }
        ```

### API Routes & Middleware Layout
*   API routes are handled in `server.ts`.
*   `server.ts` line 44 registers the global JSON body-parser: `app.use(bodyParser.json());`.
*   `server.ts` lines 132-148 registers the GET/POST endpoints for `/api/webhook/whatsapp`.

---

## 2. Logic Chain

1.  **Need for Raw Body in Signature Verification**: 
    To verify the signature of incoming webhooks correctly, the hash must be computed on the *exact byte sequence* of the raw HTTP request body. 
    *   *Step 1*: A parsed JSON object (from `bodyParser.json()`) may modify whitespace or object property order, leading to a signature mismatch.
    *   *Step 2*: Therefore, the `/api/webhook/razorpay` endpoint must process the request body as raw bytes (`Buffer`).
    *   *Step 3*: Registering the endpoint *before* `app.use(bodyParser.json())` and applying the `express.raw({ type: "application/json" })` middleware specifically on that route accomplishes this without affecting the rest of the application.

2.  **Phone Number Extraction and Normalization**:
    *   *Step 1*: The payment payload in Razorpay `payment.captured` webhooks represents a payment entity containing a `notes` map and a `contact` string.
    *   *Step 2*: The phone number can be retrieved from `payload.payload.payment.entity.notes.phone` (if provided during checkout) or `payload.payload.payment.entity.contact`.
    *   *Step 3*: Shop identifiers in Firestore are stored as strings of digits containing the country code but no leading `+` (e.g. `919999999999`).
    *   *Step 4*: To prevent lookup failures, we must strip all non-digit characters from the extracted phone. If the result is a 10-digit number, we prepend the default Indian country code (`91`).

3.  **Signature Verification Mechanism**:
    *   *Step 1*: Standard Node.js `crypto` library should be used.
    *   *Step 2*: The `x-razorpay-signature` header contains the hex digest. We compute the HMAC SHA256 signature using `process.env.RAZORPAY_WEBHOOK_SECRET` and the raw body Buffer.
    *   *Step 3*: Comparing the computed hash and the header value using `crypto.timingSafeEqual` prevents timing attack vulnerabilities. Both hashes must be converted to equal-length Buffers first.

4.  **Billing Status Update**:
    *   *Step 1*: Look up the shop using `getUser(phone)`. If it returns `null`, the shop profile doesn't exist, and the server should respond with `404 Not Found`.
    *   *Step 2*: If the shop exists, calling `setBillingStatus(phone, "active")` will update the nested field `billing.status` to `"active"` and `billing.activatedAt` to `admin.firestore.Timestamp.now()`, merging with any existing fields. This perfectly matches the contract.

---

## 3. Caveats

*   **RAZORPAY_WEBHOOK_SECRET Configuration**: The `.env` file does not currently define `RAZORPAY_WEBHOOK_SECRET`. The deployer/developer must populate this value in `.env` and `.env.example`. If not defined at server launch, requests to `/api/webhook/razorpay` should fail with a `500 Internal Server Error`.
*   **Unhandled Event Types**: Webhooks may send events other than `payment.captured` (e.g., `payment.failed`, `order.created`). The route must acknowledge these events with a `200 OK` (to prevent Razorpay from retrying) but skip any Firestore changes.
*   **Missing Shops**: In cases where a payment is captured for a phone number that is not yet registered in Firestore, a `404 Not Found` response is returned.

---

## 4. Conclusion

The integration can be fully designed around modifying `server.ts` and adding a new verification script.

### Proposed Changes

1.  **Modify `server.ts`**:
    *   Import `crypto` and add `setBillingStatus` to the `./src/database` imports.
    *   Register the route `app.post("/api/webhook/razorpay", express.raw({ type: "application/json" }), ...)` *before* `app.use(bodyParser.json());`.
    *   A patch file `proposed_server.patch` has been written in this agent folder.

2.  **Add `scratch/test-razorpay-webhook.ts`**:
    *   Create a test script that constructs a mock webhook payload, signs it using the same HMAC SHA256 logic with the configured secret, sends it to the running Express app, and inspects the database to ensure the state change was persisted.
    *   The proposed test script `proposed_test-razorpay-webhook.ts` has been written in this agent folder.

---

## 5. Verification Method

To verify the implementation once applied:

1.  **Environment Setup**:
    Add `RAZORPAY_WEBHOOK_SECRET="test_secret"` to `.env`.

2.  **Run Server**:
    Start the backend server locally:
    ```bash
    npm run dev
    ```

3.  **Run Webhook Test Script**:
    Run the proposed scratch test script:
    ```bash
    npx tsx scratch/test-razorpay-webhook.ts
    ```
    This script will:
    *   Upsert a dummy test user (`919999999999`) in Firestore.
    *   Reset their billing status to `"trial"`.
    *   Construct a mock `payment.captured` event body.
    *   Generate a valid HMAC SHA256 signature using `"test_secret"`.
    *   Send a POST request to `http://localhost:3000/api/webhook/razorpay`.
    *   Verify the response is `200 OK`.
    *   Query Firestore to verify the billing status became `"active"` with a fresh `activatedAt` timestamp.
    *   Test rejecting invalid signatures (expects `400 Bad Request`).
    *   Test handling other event types like `payment.failed` (expects `200 OK` but no database change).
    *   Test handling non-existent shop phone numbers (expects `404 Not Found`).

4.  **TypeScript & Linter Pass**:
    Ensure the project compiles without issues:
    ```bash
    npm run lint
    ```
