# Webhook Billing Integration Design Handoff (Milestone 1)

This report details the architectural design and implementation plan for the Razorpay Webhook Billing Integration (`/api/webhook/razorpay`) and its accompanying verification script.

---

## 1. Observation

### 1.1 Project Environment & Dependencies
* **Backend Framework**: Express.js with TypeScript (`tsx` execution).
* **Package Manager**: `npm` (indicated by `package-lock.json`).
* **Key Dependencies** (`package.json`):
  * `"express": "^4.21.2"`
  * `"body-parser": "^2.2.2"`
  * `"firebase-admin": "^13.8.0"`
  * `"tsx": "^4.21.0"`
  * `"typescript": "~5.8.2"`
* **Main Entry Point**: `server.ts` handles the Express application setup.
* **Global Middleware**: `app.use(bodyParser.json())` is defined in `server.ts:44`.

### 1.2 Firestore Configuration & SDK
* **Firestore SDK**: Admin SDK (`firebase-admin`).
* **Database Client Initialization** (`src/database.ts:13-35`):
  * Checks `process.env.FIREBASE_SERVICE_ACCOUNT` (JSON string).
  * If absent, checks `./service-account.json`.
  * If absent, initializes with default credentials using project ID `ai-studio-applet-webapp-51469` (or `process.env.FIREBASE_PROJECT_ID`).
  * Connects to a specific database ID `kirana-inventory-db` (or `process.env.FIREBASE_FIRESTORE_DATABASE_ID`):
    ```typescript
    const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";
    db = getFirestore(admin.app(), firestoreDatabaseId);
    ```

### 1.3 Target Firestore Path & Billing helpers
* **Firestore Document Path**: `shops/{phone}/profile/info` (referenced in `src/database.ts:204`).
* **Existing Helper Function** (`src/database.ts:229-243`):
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

---

## 2. Logic Chain

### 2.1 Capturing the Raw Request Body
The signature verification requires the exact, unaltered raw payload string. Because Express processes and parses JSON payloads using `bodyParser.json()`, the raw request bytes are lost.
* **Solution**: Modify the global body parser registration in `server.ts:44` to populate a `rawBody` property on the request object.
  ```typescript
  app.use(bodyParser.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  ```

### 2.2 Endpoint Definition and Signature Verification
The endpoint must be defined at `POST /api/webhook/razorpay` in `server.ts`.
1. Retrieve the header `x-razorpay-signature` and the environment variable `RAZORPAY_WEBHOOK_SECRET`.
2. Compute the expected signature:
   ```typescript
   const expectedSignature = crypto
     .createHmac("sha256", secret)
     .update(req.rawBody)
     .digest("hex");
   ```
3. Use `crypto.timingSafeEqual` wrapped in a `try/catch` block to compare the received signature with the expected signature to prevent timing attacks.

### 2.3 Shop Phone Number Extraction & Normalization
Upon validating the `payment.captured` event type:
1. Extract the phone number from the payload using optional chaining:
   ```typescript
   const rawPhone = payload.payment?.entity?.notes?.phone || payload.payment?.entity?.contact;
   ```
2. Because contacts or note values from Razorpay often contain formatting or a leading `+` (e.g., `+919999999999`), normalize it to match the WhatsApp inventory bot phone number format (only digits):
   ```typescript
   const phone = rawPhone.replace(/\D/g, "");
   ```

### 2.4 Firestore Update Integration
1. Verify if the shop profile exists: `const shop = await getUser(phone);`.
2. If the shop exists, invoke the pre-existing helper `setBillingStatus(phone, "active")` which sets the billing status to `"active"` and records the current Firestore server timestamp as `activatedAt`.
3. Return `200 OK` on successful update.

---

## 3. Caveats
* **Unknown Events**: Razorpay may send other events (e.g., `payment.failed`, `order.paid`). These must be acknowledged with `200 OK` but skip the billing activation logic.
* **Non-existent Shop**: If a payment is captured but the phone number does not correspond to any registered shop in Firestore, returning a `400 Bad Request` ensures the failure is clearly logged in the Razorpay Webhook Dashboard.
* **TypeScript Request Types**: Express's `Request` interface does not include `rawBody` by default. It can either be cast to `any` (e.g., `(req as any).rawBody`) or defined in a custom type definition file.

---

## 4. Conclusion & Proposed Implementation Design

### 4.1 Route Changes in `server.ts`
1. Include `crypto` in the imports:
   ```typescript
   import crypto from "crypto";
   ```
2. Modify the body-parser setup to capture the raw body:
   ```typescript
   app.use(bodyParser.json({
     verify: (req: any, res, buf) => {
       req.rawBody = buf;
     }
   }));
   ```
3. Import `setBillingStatus` from `./src/database`:
   ```typescript
   import { 
     getUser, saveUser, updateStock, getInventory, 
     logTransaction, getTodayTransactions,
     getOnboardingState, setOnboardingState, clearOnboardingState,
     setItemPrice, getItemPrice, getPriceQueue, addToPriceQueue, shiftPriceQueue,
     logParserMetric, checkAndRegisterMessageId, setBillingStatus
   } from "./src/database";
   ```
4. Define the POST Route:
   ```typescript
   app.post("/api/webhook/razorpay", async (req, res) => {
     const signature = req.headers["x-razorpay-signature"] as string;
     const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

     if (!signature) {
       console.error("[RAZORPAY WEBHOOK] Missing signature header.");
       return res.status(400).send("Bad Request: Missing signature");
     }

     if (!webhookSecret) {
       console.error("[RAZORPAY WEBHOOK] Webhook secret not configured.");
       return res.status(500).send("Internal Server Error: Secret not configured");
     }

     const rawBody = (req as any).rawBody;
     if (!rawBody) {
       console.error("[RAZORPAY WEBHOOK] Raw request body missing.");
       return res.status(400).send("Bad Request: Missing body");
     }

     // 1. Signature Verification
     const expectedSignature = crypto
       .createHmac("sha256", webhookSecret)
       .update(rawBody)
       .digest("hex");

     let isValid = false;
     try {
       isValid = crypto.timingSafeEqual(
         Buffer.from(signature, "utf-8"),
         Buffer.from(expectedSignature, "utf-8")
       );
     } catch {
       isValid = false;
     }

     if (!isValid) {
       console.error("[RAZORPAY WEBHOOK] Signature verification failed.");
       return res.status(400).send("Bad Request: Invalid signature");
     }

     const event = req.body;

     // 2. Process payment.captured event
     if (event.event === "payment.captured") {
       const payment = event.payload?.payment?.entity;
       if (!payment) {
         console.error("[RAZORPAY WEBHOOK] Missing payment entity.");
         return res.status(400).send("Bad Request: Missing payment entity");
       }

       const rawPhone = payment.notes?.phone || payment.contact;
       if (!rawPhone) {
         console.error("[RAZORPAY WEBHOOK] Phone number not found in webhook notes or contact.");
         return res.status(400).send("Bad Request: Phone number not found");
       }

       const phone = rawPhone.replace(/\D/g, "");

       try {
         const user = await getUser(phone);
         if (!user) {
           console.error(`[RAZORPAY WEBHOOK] Shop with phone ${phone} does not exist in Firestore.`);
           return res.status(400).send(`Bad Request: Shop with phone ${phone} not found`);
         }

         await setBillingStatus(phone, "active");
         console.log(`[RAZORPAY WEBHOOK] Successfully activated billing for shop: ${phone}`);
         return res.status(200).send("OK");
       } catch (error: any) {
         console.error(`[RAZORPAY WEBHOOK] Firestore update failed for ${phone}:`, error.message);
         return res.status(500).send("Internal Server Error");
       }
     }

     // Other events return 200 OK to prevent retries
     console.log(`[RAZORPAY WEBHOOK] Ignored unhandled event: ${event.event}`);
     return res.status(200).send("Event ignored");
   });
   ```

### 4.2 Verification Script Structure (`scratch/test-razorpay-webhook.ts`)
The script must perform the following actions:
1. Initialize/reset the billing status of a designated test shop (e.g. `919999999999`) to `"expired"` in Firestore.
2. Formulate a valid mock `payment.captured` event payload containing the target phone number in the contact or notes.
3. Compute the correct signature header using the payload and `RAZORPAY_WEBHOOK_SECRET`.
4. Trigger the HTTP POST endpoint `/api/webhook/razorpay` on the running local Express server.
5. Verify the HTTP response status (`200 OK`).
6. Query Firestore to assert that the target shop's billing status has transitioned to `"active"` and that a valid `activatedAt` timestamp exists.
7. Test rejection paths by sending an invalid signature and expecting a `400 Bad Request`.

*Complete script structure is provided in the verification section.*

---

## 5. Verification Method

### 5.1 Verification Commands
1. Start the server locally:
   ```bash
   npm run dev
   ```
2. Run the scratch test script:
   ```bash
   npx tsx scratch/test-razorpay-webhook.ts
   ```

### 5.2 Verification Script Code
The verification script code should be structured as follows:
```typescript
import axios from "axios";
import crypto from "crypto";
import admin from "firebase-admin";
import { db } from "../src/database";
import dotenv from "dotenv";

dotenv.config();

const TEST_PHONE = "919999999999";
const WEBHOOK_URL = "http://localhost:3000/api/webhook/razorpay";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "test_secret";

async function main() {
  console.log("==========================================");
  console.log("🧪 TESTING RAZORPAY WEBHOOK INTEGRATION");
  console.log("==========================================");

  // 1. Setup Firestore Mock State
  console.log(`\nStep 1: Setting up shop profile in Firestore for ${TEST_PHONE}...`);
  const profileRef = db.collection("shops").doc(TEST_PHONE).collection("profile").doc("info");
  
  const profileDoc = await profileRef.get();
  if (!profileDoc.exists) {
    console.log("Creating default profile first...");
    await profileRef.set({
      ownerName: "Test Owner",
      shopName: "Test Shop",
      phone: TEST_PHONE,
      language: "english",
    });
  }

  // Set billing status to expired before sending the webhook
  await profileRef.set({
    billing: {
      status: "expired",
      trialStartedAt: admin.firestore.Timestamp.now()
    }
  }, { merge: true });

  console.log("Firestore setup complete. Shop billing set to 'expired'.");

  // 2. Formulate Payload
  console.log("\nStep 2: Constructing mock payment.captured payload...");
  const mockPayload = {
    entity: "event",
    account_id: "acc_test123",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: "pay_test_" + Math.random().toString(36).substring(7),
          entity: "payment",
          amount: 9900,
          currency: "INR",
          status: "captured",
          contact: `+${TEST_PHONE}`,
          notes: {
            phone: TEST_PHONE
          }
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };
  const rawBody = JSON.stringify(mockPayload);

  // 3. Compute Signature
  console.log("Step 3: Calculating HMAC hex digest signature...");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(rawBody)
    .digest("hex");

  // 4. Send Webhook Request
  console.log("\nStep 4: Sending POST request with VALID signature...");
  try {
    const response = await axios.post(WEBHOOK_URL, mockPayload, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature
      }
    });

    console.log(`Response Status: ${response.status} (${response.statusText})`);
    if (response.status === 200) {
      console.log("✅ Webhook accepted the payload successfully.");
    }
  } catch (error: any) {
    console.error("❌ Request failed:", error.response?.data || error.message);
  }

  // 5. Verify Firestore State Transition
  console.log("\nStep 5: Verifying Firestore billing state update...");
  const updatedProfileDoc = await profileRef.get();
  const billingData = updatedProfileDoc.data()?.billing;
  console.log("Updated Billing Status in Firestore:", billingData);

  if (billingData && billingData.status === "active" && billingData.activatedAt) {
    console.log("✅ SUCCESS: Billing status updated to 'active'!");
    console.log(`Activated At: ${billingData.activatedAt.toDate().toISOString()}`);
  } else {
    console.log("❌ FAILURE: Firestore state did not match expected 'active' status.");
  }

  // 6. Test Signature Rejection
  console.log("\nStep 6: Testing negative scenario (invalid signature)...");
  try {
    await axios.post(WEBHOOK_URL, mockPayload, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_signature_hash_value"
      }
    });
    console.log(`❌ Unexpected Success: Webhook did not reject invalid signature!`);
  } catch (error: any) {
    if (error.response && error.response.status === 400) {
      console.log("✅ Expected Failure: Received 400 Bad Request for invalid signature.");
    } else {
      console.log(`❌ Unexpected response for invalid signature: ${error.message}`);
    }
  }

  console.log("\n==========================================");
  console.log("🏁 TEST PASS COMPLETED");
  console.log("==========================================");
}

main().catch(console.error);
export {};
```
