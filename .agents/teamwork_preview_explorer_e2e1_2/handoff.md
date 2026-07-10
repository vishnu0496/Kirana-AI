# Handoff Report — Explorer 2 (E2E Testing Track)

## 1. Observation
The following code structures and behaviors were observed in the codebase:
- **Firestore Database Initialization (`src/database.ts`, lines 32-34)**:
  ```typescript
  const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";
  console.log(`[INIT] Connecting to Firestore Database: ${firestoreDatabaseId}`);
  db = getFirestore(admin.app(), firestoreDatabaseId);
  ```
- **Onboarding and Profile Collections (`src/database.ts`)**:
  - Onboarding documents: `db.collection("onboarding").doc(phone)` (lines 53-64)
  - User profiles: `db.collection("shops").doc(phone).collection("profile").doc("info")` (lines 38-51)
  - Inventory items: `db.collection("shops").doc(phone).collection("inventory").doc(itemKey)` (lines 67-81)
  - Logs/transactions: `db.collection("shops").doc(phone).collection("logs")` (lines 160-171)
  - Parser Metrics: `db.collection("parser_metrics")` (lines 245-254)
  - Webhook Receipts (Idempotency): `db.collection("webhook_receipts")` (lines 256-270)
- **WhatsApp Webhook Outbound Request (`server.ts`, lines 73-80)**:
  ```typescript
  await axios.post(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text },
  }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  ```
- **Onboarding Flow State Transition (`server.ts`, lines 175-192)**:
  - If no profile exists and no onboarding state exists: sets state to `awaiting_shop_name`, detects language, sends `askShopName` template.
  - If state is `awaiting_shop_name`: saves `shopName`, sets state to `awaiting_owner_name`, sends `shopRegistered` template.
  - If state is `awaiting_owner_name`: saves user profile (`shopName`, `ownerName`, `language`), clears onboarding state, sends `welcomeUser` template.
- **Language Detection & Switch (`src/parser.ts`, lines 107-118)**:
  - Matches language-specific regexes against input strings.
  - Switches registered user's language dynamically (`server.ts`, lines 209-214):
    ```typescript
    let lang = (profile.language as Lang) || "english";
    const newLang = detectLanguage(messageText);
    if ((newLang === "telugu" || newLang === "hindi") && newLang !== lang) {
      lang = newLang;
      await saveUser(sender, { language: lang });
    }
    ```
- **Testing Dependencies (`package.json`)**: No testing libraries (e.g., Jest, ts-jest, mocha, supertest) are installed under `dependencies` or `devDependencies`.

---

## 2. Logic Chain
- **Database Isolation Strategy**: Since `src/database.ts` parses the database ID from `process.env.FIREBASE_FIRESTORE_DATABASE_ID`, we can isolate testing from development by overriding this environment variable (e.g., to `"kirana-inventory-db-test"`). Furthermore, the Firebase Admin SDK automatically connects to local Firestore emulator if `process.env.FIRESTORE_EMULATOR_HOST` is set.
- **Programmatic Database Management**:
  - *Clearing*: The Firestore emulator exposes a `DELETE` API to wipe documents instantly, while Cloud Firestore requires recursive deletion. Since we use `firebase-admin`, we can use `recursiveDelete()` on root collection documents to clean up cloud test databases programmatically.
  - *Seeding & Asserting*: We can write direct helper functions interacting with the `firebase-admin` Firestore instance to insert known states (like registered shop profile with expired billing status, or custom onboarding steps) and assert outcomes post-test.
- **WhatsApp Webhook Interception**: Because the Express server POSTs directly to hardcoded `https://graph.facebook.com/...`, tests cannot inspect outbound replies. By parameterizing the URL base via environment variables (e.g., `WHATSAPP_API_URL || "https://graph.facebook.com"`), a local test runner can spawn a mock WhatsApp server on `localhost:3001` and direct outgoing calls there to assert the correct template response is dispatched.
- **Feature Verification**:
  - *Onboarding Flow*: Verification requires step-by-step webhook post simulation for a new number and asserting the state transitions sequentially in the `onboarding` and `shops` Firestore collections.
  - *Language Switch*: Switch verification requires setting up a profile in one language, sending a message in another language, and verifying that the database profile language updates and the returned reply template matches the new language.

---

## 3. Caveats
- We assumed that `firebase-tools` (containing the Firestore emulator) and a Java Runtime Environment can be installed by the developer or running environment. If Java is unavailable, the cloud test database (Option B) must be used.
- The outbound WhatsApp API base URL must be parameterized in `server.ts` to allow local mocking. Currently, it is hardcoded to `https://graph.facebook.com`.
- There is no automated test runner configured in the repository yet. The implementer must configure a test runner (e.g., `jest` or a custom typescript script using `tsx`).

---

## 4. Conclusion
1. **Firestore Setup**: E2E testing should support two modes: Local Emulator (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`) and Cloud Test Database (`FIREBASE_FIRESTORE_DATABASE_ID=kirana-inventory-db-test`).
2. **Operations**: The test runner should use helper functions utilizing `recursiveDelete()` to clean database documents (or HTTP DELETE for the emulator), set database documents directly to seed preconditions, and retrieve documents directly to assert postconditions.
3. **Verification Strategies**:
   - **Onboarding Flow**: Verify by walking through three request phases, asserting that the Firestore `onboarding` step shifts from `awaiting_shop_name` to `awaiting_owner_name`, then deletes itself and populates the `shops` profile.
   - **Language Switch**: Verify by initializing onboarding in Hindi/Telugu via greeting keywords, and by sending a language-switching keyword to a registered user and asserting the updated profile field in Firestore and outbound template.

---

## 5. Verification Method
1. Inspect `analysis.md` located in `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_e2e1_2\` to review the proposed Firestore integration scripts, setup details, and test flows.
2. Verify that `analysis.md` addresses the specific queries from the user request.
3. Verify that no source code files or tests were added or modified, adhering to the read-only constraint of this task.
