# Handoff Report: Razorpay Webhook Billing Integration (Milestone 1)

## 1. Observation

- **Backend Framework**: Express.js is used as the web framework.
  - From `package.json` line 18:
    `"express": "^4.21.2",`
  - From `server.ts` line 43:
    `const app = express();`
- **Package Manager & Execution**: NPM is the package manager (`package-lock.json` present), and `tsx` is used to run TypeScript files directly.
  - From `package.json` line 7-8:
    ```json
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    ```
- **Firestore Configuration**: Configuration and initialization are handled in `src/database.ts` using `firebase-admin/firestore`.
  - From `src/database.ts` lines 11-35:
    ```typescript
    let db: admin.firestore.Firestore;
    ...
    const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";
    console.log(`[INIT] Connecting to Firestore Database: ${firestoreDatabaseId}`);
    db = getFirestore(admin.app(), firestoreDatabaseId);
    ```
- **Existing Billing & Profile Helpers**:
  - The Firestore profile path is `shops/{phone}/profile/info`.
  - From `src/database.ts` lines 38-42:
    ```typescript
    async function getUser(phone: string) {
      const profileRef = db.collection("shops").doc(phone).collection("profile").doc("info");
      const doc = await profileRef.get();
      return doc.exists ? doc.data() : null;
    }
    ```
  - From `src/database.ts` lines 229-243:
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
- **Webhook Gateway Configuration**:
  - Existing WhatsApp webhook endpoints are mapped in `server.ts`:
    - `app.get("/api/webhook/whatsapp", ...)` (line 132)
    - `app.post("/api/webhook/whatsapp", ...)` (line 138)
  - Raw body stream parsing is not currently captured because of global JSON parser:
    - `app.use(bodyParser.json());` (line 44)

---

## 2. Logic Chain

1. **Backend Integration**:
   - Since all API routes are configured in `server.ts` using standard Express app routing (`app.post` / `app.get`), the new Razorpay webhook endpoint should be registered in `server.ts` as `app.post("/api/webhook/razorpay", ...)`.
2. **Raw Body Extraction**:
   - Razorpay signature verification requires the exact, unaltered raw payload string.
   - Because `app.use(bodyParser.json())` is globally configured on line 44 of `server.ts`, it consumes the request input stream.
   - To capture the raw body without changing route declaration order or duplicating parser logic, we can configure `bodyParser.json()` with a `verify` option to store the raw buffer on `req.rawBody` (e.g. `req.rawBody = buf`).
3. **Phone Number Normalization**:
   - Razorpay payment webhook payload structure for `payment.captured` holds the customer phone either under `payload.payment.entity.notes.phone` or `payload.payment.entity.contact`.
   - The phone number in Firestore is stored as a standard digits-only WhatsApp string (e.g. `919999999999`).
   - Therefore, the extracted phone number must be normalized by removing all non-digit characters (`phone.replace(/\D/g, "")`) to allow successful lookup via `getUser(phone)`.
4. **Signature Verification**:
   - Verification must be performed using HMAC hex digest with SHA256 of the raw body and `RAZORPAY_WEBHOOK_SECRET`.
   - The resulting hex hash must be compared against the `x-razorpay-signature` request header.
5. **Database Billing Upgrade**:
   - If the payment is valid and the shop profile exists, we can use the pre-built `setBillingStatus(phone, "active")` function in `src/database.ts`.
   - This function automatically retrieves the current billing record, changes status to `"active"`, sets `activatedAt` to `admin.firestore.Timestamp.now()`, and performs a merged write to the profile doc.

---

## 3. Caveats

- **Missing Environment Variables**: If `RAZORPAY_WEBHOOK_SECRET` is not set in the `.env` file, signature verification will fail. The webhook endpoint must validate that the secret exists and return a `500 Internal Server Error` or log an error if it is missing, or reject requests with `400 Bad Request`.
- **Database ID Fallback**: In local emulator / test mode, the Firestore client will target `kirana-inventory-db` (from `.env` or fallback), so the Firestore emulator / instance must have this database initialized.
- **Port Assumption**: The verification script assumes the server is running on `http://localhost:3000` (or dynamically loads `PORT` from `.env`).

---

## 4. Conclusion

The implementation of Milestone 1 is fully feasible and should follow these design steps:

### A. Raw Body Middleware Setup
In `server.ts` (around line 44), replace:
```typescript
app.use(bodyParser.json());
```
with:
```typescript
app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
```

### B. Route Handler for Razorpay Webhook
Implement `app.post("/api/webhook/razorpay", ...)` inside `server.ts` with the following structure:
```typescript
import crypto from "crypto";
// Note: Ensure setBillingStatus and getUser are imported from ./src/database

app.post("/api/webhook/razorpay", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!signature || !secret) {
    console.error("[RAZORPAY WEBHOOK ERROR] Missing signature or webhook secret");
    return res.status(400).send("Signature or secret missing");
  }

  // 1. Signature Verification
  const rawBody = (req as any).rawBody || Buffer.from("");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.warn("[RAZORPAY WEBHOOK WARNING] Signature verification failed");
    return res.status(400).send("Bad Request: Signature verification failed");
  }

  // 2. Validate Event Type
  const { event, payload } = req.body;
  if (event !== "payment.captured") {
    console.log(`[RAZORPAY WEBHOOK] Ignored event type: ${event}`);
    return res.status(200).json({ status: "ignored" });
  }

  // 3. Extract Phone Number
  const paymentEntity = payload?.payment?.entity;
  let rawPhone = paymentEntity?.notes?.phone || paymentEntity?.contact;
  
  if (!rawPhone && paymentEntity?.description) {
    const match = paymentEntity.description.match(/\b\d{10,12}\b/);
    if (match) rawPhone = match[0];
  }

  if (!rawPhone) {
    console.error("[RAZORPAY WEBHOOK ERROR] Phone number not found in webhook payload");
    return res.status(400).send("Bad Request: Phone number not found");
  }

  // Normalize phone (digits only)
  const phone = rawPhone.replace(/\D/g, "");

  try {
    // 4. Verify shop profile exists in Firestore
    const profile = await getUser(phone);
    if (!profile) {
      console.warn(`[RAZORPAY WEBHOOK WARNING] Shop profile not found for phone: ${phone}`);
      return res.status(404).send("Shop profile not found");
    }

    // 5. Update status and activatedAt in Firestore
    await setBillingStatus(phone, "active");
    console.log(`[RAZORPAY WEBHOOK SUCCESS] Billing upgraded to active for shop: ${phone}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("[RAZORPAY WEBHOOK ERROR] Database update failed:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});
```

### C. Verification Script Setup
Create `scratch/test-razorpay-webhook.ts` with the following implementation:
```typescript
import axios from "axios";
import crypto from "crypto";
import { getBilling, setBillingStatus, saveUser } from "../src/database";

async function main() {
  const PORT = process.env.PORT || 3000;
  const url = `http://localhost:${PORT}/api/webhook/razorpay`;
  
  // Use either actual webhook secret or default for tests
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret; // Set it programmatically in process env
  
  const testPhone = "919999999999";
  
  console.log("==========================================");
  console.log("🧪 TESTING RAZORPAY BILLING WEBHOOK");
  console.log("==========================================");

  // 1. Prepare/Reset test shop profile in Firestore to trial status
  console.log(`\nInitializing test shop ${testPhone}...`);
  await saveUser(testPhone, { ownerName: "Test Owner", shopName: "Test Shop" });
  await setBillingStatus(testPhone, "trial");
  
  const initialBilling = await getBilling(testPhone);
  console.log(`Initial Status: "${initialBilling.status}" (trialStartedAt: ${initialBilling.trialStartedAt?.toDate().toISOString()})`);

  // 2. Construct mock payment.captured payload
  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_" + Math.random().toString(36).substring(7),
          amount: 9900,
          currency: "INR",
          status: "captured",
          notes: {
            phone: testPhone
          }
        }
      }
    }
  };

  const rawBody = JSON.stringify(payload);
  
  // 3. Test Invalid Signature Rejection
  console.log("\n🚀 Testing invalid signature (expecting 400 rejection)...");
  try {
    await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_hmac_signature_here"
      }
    });
    console.error("❌ Test failed: Server accepted an invalid signature.");
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log("✅ Server correctly rejected invalid signature with 400 Bad Request");
    } else {
      console.error(`❌ Unexpected error: ${error.message}`);
    }
  }

  // 4. Test Valid Webhook Processing
  console.log("\n🚀 Sending valid payment.captured webhook...");
  const validSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  try {
    const res = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validSignature
      }
    });
    console.log(`Server Response Status: ${res.status}`);
    
    // 5. Verify Firestore billing status upgrade
    const updatedBilling = await getBilling(testPhone);
    if (updatedBilling.status === "active" && updatedBilling.activatedAt) {
      console.log(`\n✅ Success! Billing status upgraded to "${updatedBilling.status}"`);
      console.log(`Activated At: ${updatedBilling.activatedAt.toDate().toISOString()}`);
    } else {
      console.error(`❌ Firestore status mismatch. Status: "${updatedBilling.status}"`);
    }
  } catch (error: any) {
    console.error("❌ Valid webhook processing failed:", error.response?.data || error.message);
  }
  console.log("==========================================\n");
}

main().catch(console.error);
export {};
```

---

## 5. Verification Method

To verify the implementation:
1. Ensure the Firestore emulator or local database is running.
2. Start the local server:
   ```bash
   npx tsx server.ts
   ```
3. In another terminal window, set `RAZORPAY_WEBHOOK_SECRET` and run the script:
   ```bash
   $env:RAZORPAY_WEBHOOK_SECRET="test_secret"
   npx tsx scratch/test-razorpay-webhook.ts
   ```
4. Verify the console output shows:
   - Rejected invalid signature with `400 Bad Request`.
   - Valid webhook returns `200 OK`.
   - Billing status upgraded to `"active"` with a correct `activatedAt` timestamp.
