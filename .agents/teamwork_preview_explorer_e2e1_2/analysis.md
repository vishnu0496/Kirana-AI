# E2E Test Strategy & Firestore Setup Analysis

## 1. Introduction & Summary
This document presents the E2E testing architecture proposal for the **KiranaAI WhatsApp Inventory Bot**. In order to achieve opaque-box, requirement-driven testing as defined in `SCOPE.md`, the E2E test suite must execute HTTP requests against the `/api/webhook/whatsapp` endpoint and verify correctness by inspecting the state of the Firestore database and intercepting outbound WhatsApp API requests. 

This analysis details:
* The proposed Firestore database configuration modes (local emulator and dedicated cloud test DB).
* Programmatic utilities to clear, seed, and assert Firestore database states.
* Step-by-step verification flows for the **Onboarding Flow** and **Language Detection & Switch** features.

---

## 2. Firestore Database Setup for E2E Testing

The project uses `firebase-admin` in `src/database.ts` and connects to a Firestore database dynamically configured via environment variables. We propose two setup options for isolating test data:

### Option A: Local Firestore Emulator (Recommended)
This approach runs all database queries against a local emulator, ensuring tests are 100% offline, fast, and cost-free.

1. **Configuration**:
   * Set environment variable `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`.
   * Set environment variable `FIREBASE_PROJECT_ID=kirana-inventory-test` (a dummy ID is sufficient when using the emulator).
   * Ensure `firebase-tools` is installed locally (`npm install --save-dev firebase-tools`) and a Java Runtime Environment (JRE) is available.
2. **Execution**:
   * Start the emulator: `npx firebase emulators:start --only firestore --project kirana-inventory-test`
   * Run the Express server in the test process or a child process with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`.
3. **Clearing State**:
   * The emulator provides an HTTP endpoint to wipe the entire database instantly:
     `DELETE http://127.0.0.1:8080/emulator/v1/projects/kirana-inventory-test/databases/(default)/documents`

### Option B: Cloud Firestore Test Database ID
If local emulator setup is not feasible or in simple CI systems, a dedicated test database in Google Cloud can be used.

1. **Configuration**:
   * In `src/database.ts` (lines 32-34), the database ID is determined by:
     `const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";`
   * Set environment variable `FIREBASE_FIRESTORE_DATABASE_ID=kirana-inventory-db-test`.
   * Ensure a service account key is available in `service-account.json` or `process.env.FIREBASE_SERVICE_ACCOUNT`.
2. **Clearing State**:
   * Cloud database records must be recursively deleted collection-by-collection using the Admin SDK's `recursiveDelete` API.

---

## 3. Programmatic Firestore Operations (Clear, Seed, Assert)

The test runner (e.g. Jest or a node-based test script) should implement helper functions using `firebase-admin` to manage the database lifecycle. Below are the recommended implementation specifications.

### A. Clearing the Database

#### For Local Emulator
```typescript
import axios from "axios";

async function clearEmulatorDatabase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "kirana-inventory-test";
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)";
  const url = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/${databaseId}/documents`;
  
  await axios.delete(url);
}
```

#### For Cloud Firestore
If using Option B, delete root collections recursively:
```typescript
import { db } from "../src/database";

async function clearCloudDatabase() {
  const collections = ["shops", "onboarding", "parser_metrics", "webhook_receipts"];
  for (const col of collections) {
    const snapshot = await db.collection(col).get();
    for (const doc of snapshot.docs) {
      await db.recursiveDelete(doc.ref);
    }
  }
}
```

---

### B. Seeding the Database

To test feature boundary states (like expired billing, preexisting stock, or active onboarding step), the test runner must pre-populate specific documents.

#### 1. Seeding User Profile & Billing Status
Allows testing standard operations (active billing), trials, or expired paywall limits.
```typescript
import { db } from "../src/database";
import admin from "firebase-admin";

async function seedUserProfile(phone: string, data: {
  shopName: string;
  ownerName: string;
  language: "english" | "telugu" | "hindi";
  billingStatus: "trial" | "active" | "expired";
  trialStartedDaysAgo?: number;
}) {
  let billing: any = { status: data.billingStatus };
  
  if (data.billingStatus === "trial") {
    const date = new Date();
    if (data.trialStartedDaysAgo !== undefined) {
      date.setDate(date.getDate() - data.trialStartedDaysAgo);
    }
    billing.trialStartedAt = admin.firestore.Timestamp.fromDate(date);
  } else if (data.billingStatus === "active") {
    billing.trialStartedAt = admin.firestore.Timestamp.now();
    billing.activatedAt = admin.firestore.Timestamp.now();
  }

  await db.collection("shops").doc(phone).collection("profile").doc("info").set({
    phone,
    shopName: data.shopName,
    ownerName: data.ownerName,
    language: data.language,
    billing,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
```

#### 2. Seeding Inventory Items
Allows seeding preexisting stock to test sell-offs or stock increments.
```typescript
async function seedInventoryItem(phone: string, itemName: string, quantity: number, price: number, unit: string = "") {
  const itemKey = itemName.toLowerCase().trim();
  await db.collection("shops").doc(phone).collection("inventory").doc(itemKey).set({
    name: itemName,
    quantity,
    unit,
    price,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
```

#### 3. Seeding Onboarding State
Allows starting a test directly from a specific step in the onboarding flow.
```typescript
async function seedOnboardingState(phone: string, step: "awaiting_shop_name" | "awaiting_owner_name", language: "english" | "telugu" | "hindi") {
  await db.collection("onboarding").doc(phone).set({
    step,
    language
  });
}
```

---

### C. Asserting Database State

After trigger events (sending webhooks), the test runner must query Firestore to verify details.

#### 1. Assert Inventory Stock and Price
```typescript
async function assertInventoryItem(phone: string, itemName: string, expectedQty: number, expectedPrice?: number) {
  const itemKey = itemName.toLowerCase().trim();
  const doc = await db.collection("shops").doc(phone).collection("inventory").doc(itemKey).get();
  
  if (!doc.exists) {
    throw new Error(`Inventory item '${itemName}' does not exist!`);
  }
  
  const data = doc.data()!;
  if (data.quantity !== expectedQty) {
    throw new Error(`Expected quantity ${expectedQty}, got ${data.quantity}`);
  }
  if (expectedPrice !== undefined && data.price !== expectedPrice) {
    throw new Error(`Expected price ${expectedPrice}, got ${data.price}`);
  }
  return data;
}
```

#### 2. Assert Transaction Logging
Verify that transactions are written to the sub-collection `logs` for historical reporting.
```typescript
async function assertTransactionLog(phone: string, action: "ADD" | "SELL", itemName: string, expectedQty: number) {
  const snapshot = await db.collection("shops").doc(phone).collection("logs").where("item", "==", itemName).get();
  
  if (snapshot.empty) {
    throw new Error(`No transaction logs found for item '${itemName}'`);
  }
  
  const log = snapshot.docs.find(d => d.data().action === action && d.data().quantity === expectedQty);
  if (!log) {
    throw new Error(`No matching log found with action ${action} and quantity ${expectedQty}`);
  }
  return log.data();
}
```

#### 3. Assert Parser Metrics Logging
Verify that processing method stats are written to `parser_metrics`.
```typescript
async function assertParserMetric(phone: string, message: string, expectedParsedBy: "regex" | "gemini" | "unknown") {
  const snapshot = await db.collection("parser_metrics")
    .where("phone", "==", phone)
    .where("message", "==", message)
    .get();
    
  if (snapshot.empty) {
    throw new Error(`No parser metric logged for phone '${phone}' with message '${message}'`);
  }
  const metric = snapshot.docs[0].data();
  if (metric.parsedBy !== expectedParsedBy) {
    throw new Error(`Expected parsedBy to be '${expectedParsedBy}', got '${metric.parsedBy}'`);
  }
  return metric;
}
```

---

## 4. Verification Strategy: Onboarding Flow

### Architectural Prerequisite: Mocking WhatsApp API Outbound Messages
In `server.ts`, outgoing WhatsApp messages are posted to `https://graph.facebook.com/v20.0/${PHONE_ID}/messages` via `axios`. 
For E2E tests to assert these messages:
1. **Proposal**: Request the implementation team to parameterize the base URL in `server.ts` using an environment variable (e.g. `WHATSAPP_API_URL` defaulting to `https://graph.facebook.com`).
2. **Local Mock Server**: The E2E test harness will run a simple Express mock server on port `3001` before starting the application server. The test suite starts the main server with `WHATSAPP_API_URL=http://localhost:3001`.
3. **Capture & Assert**: The mock server stores outgoing messages in an in-memory queue, which the test suite queries to assert that the correct WhatsApp templates are dispatched.

### Onboarding Flow Test Plan (Step-by-Step)
For an onboarding number `+919999999999`:

| Step | Trigger (POST to Webhook) | Expected Firestore State Change | Expected WhatsApp Reply (from Mock) |
|---|---|---|---|
| **Start / Lang Detect** | Send message `"hi"` from `+919999999999` | Doc created in `onboarding/+919999999999`: `{ step: "awaiting_shop_name", language: "english" }` | `askShopName`: "Welcome to Kirana AI! 👋 What is your shop name?" |
| **Set Shop Name** | Send message `"Rao Grocery"` from `+919999999999` | Doc in `onboarding` updated: `{ step: "awaiting_owner_name", language: "english", shopName: "Rao Grocery" }` | `shopRegistered`: "Great! Rao Grocery registered ✅ What is your name?" |
| **Set Owner & Finish**| Send message `"Ramrao"` from `+919999999999` | 1. Doc `onboarding/+919999999999` is deleted.<br>2. Doc `shops/+919999999999/profile/info` created: `{ shopName: "Rao Grocery", ownerName: "Ramrao", language: "english", phone: "+919999999999", billing: { status: "trial", trialStartedAt: Timestamp } }` | `welcomeUser`: "Welcome Ramrao! 🎉 Rao Grocery is ready..." |

---

## 5. Verification Strategy: Language Detection & Switch

The system supports English, Telugu (`telugu`), and Hindi (`hindi`). We must verify that:
1. The onboarding language is correctly detected from the initial greeting message.
2. A registered user can switch languages mid-session by typing triggers in another language.

### A. Onboarding Language Detection Test
* **Telugu Onboarding Initialization**:
  * Action: Send `"నమస్తే"` (namaste/namaskaram trigger) from a new phone number.
  * Assert: Document created in `onboarding` has `language: "telugu"` and `step: "awaiting_shop_name"`.
  * Assert: Outbound mock receives Telugu reply: `"Kirana AI ki swaagatam! 👋 Mee shop peru cheppagalaru?"`.
* **Hindi Onboarding Initialization**:
  * Action: Send `"नमस्ते"` (Hindi namaste trigger) from a new phone number.
  * Assert: Document created in `onboarding` has `language: "hindi"` and `step: "awaiting_shop_name"`.
  * Assert: Outbound mock receives Hindi reply: `"Kirana AI mein swagat! 👋 Apka shop ka naam kya hai?"`.

### B. Registered User Language Switching Test
* **English to Telugu Switch**:
  * Setup: Seed `shops/+918888888888/profile/info` with `language: "english"` and active billing status.
  * Action: Send message `"namaskaram"` from `+918888888888`.
  * Assert: Firestore document `shops/+918888888888/profile/info` updates `language` property to `"telugu"`.
  * Assert: Outbound mock receives Telugu greeting message: `"Baagundi Owner anna! 👋 Ela help cheyyali?..."` (translated template).
* **Telugu to Hindi Switch**:
  * Action: Send message `"namaste"` from `+918888888888`.
  * Assert: Firestore document `shops/+918888888888/profile/info` updates `language` property to `"hindi"`.
  * Assert: Outbound mock receives Hindi greeting message: `"Kya haal hai Owner bhai! 👋 Kya help chahiye?..."` (translated template).
