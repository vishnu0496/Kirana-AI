# Tier 1 (Feature Coverage) Test Cases

This document defines the Tier 1 E2E feature coverage test cases for the KiranaAI Bot. It details 45 happy path test scenarios across 9 core features, including exact pre-conditions, input payloads/headers, and post-conditions (HTTP status, Firestore updates, and outbound WhatsApp messages).

---

## Feature Matrix Summary

| ID | Feature | Scenarios | Target Endpoint | Key Firestore Collections |
|----|---------|-----------|-----------------|---------------------------|
| 1  | Onboarding | 1.1 – 1.5 | `/api/webhook/whatsapp` | `onboarding`, `shops` |
| 2  | WhatsApp Signatures | 2.1 – 2.5 | `/api/webhook/whatsapp` | None (Middleware level verification) |
| 3  | Webhook Idempotency | 3.1 – 3.5 | `/api/webhook/whatsapp` | `webhook_receipts` |
| 4  | Razorpay Billing | 4.1 – 4.5 | `/api/webhook/razorpay` | `shops` |
| 5  | Inventory ADD/SELL/Fuzzy | 5.1 – 5.5 | `/api/webhook/whatsapp` | `shops/.../inventory`, `shops/.../logs` |
| 6  | Price Queue | 6.1 – 6.5 | `/api/webhook/whatsapp` | `shops/.../profile/info`, `shops/.../inventory` |
| 7  | Queries & Reports | 7.1 – 7.5 | `/api/webhook/whatsapp` | `shops/.../inventory`, `shops/.../logs` |
| 8  | Low Stock Alerts | 8.1 – 8.5 | `/api/webhook/whatsapp` | `shops/.../inventory` |
| 9  | Language Detection | 9.1 – 9.5 | `/api/webhook/whatsapp` | `shops/.../profile/info` |

---

## 1. Onboarding
Verifies the multi-step conversational onboarding flow for new users.

### Scenario 1.1: English User - Initial Greeting (Start Onboarding)
*   **Pre-conditions**: No profile document exists at `shops/919999999999/profile/info`. No document exists at `onboarding/919999999999`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_101",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "hello" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Create `onboarding/919999999999` with:
        ```json
        {
          "step": "awaiting_shop_name",
          "language": "english"
        }
        ```
    *   **Outbound WhatsApp Message (Mock)**:
        *   **POST**: `https://graph.facebook.com/v20.0/1234567890/messages`
        *   **Body**:
            ```json
            {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "919999999999",
              "type": "text",
              "text": { "body": "Welcome to Kirana AI! 👋\nWhat is your shop name?" }
            }
            ```

### Scenario 1.2: Awaiting Shop Name - Provide Shop Name
*   **Pre-conditions**: Document `onboarding/919999999999` contains `{"step": "awaiting_shop_name", "language": "english"}`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_102",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "Metro Kirana Store" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Update `onboarding/919999999999` to:
        ```json
        {
          "step": "awaiting_owner_name",
          "language": "english",
          "shopName": "Metro Kirana Store"
        }
        ```
    *   **Outbound WhatsApp Message (Mock)**:
        *   **POST**: `https://graph.facebook.com/v20.0/1234567890/messages`
        *   **Body**:
            ```json
            {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "919999999999",
              "type": "text",
              "text": { "body": "Great! Metro Kirana Store registered ✅\nWhat is your name?" }
            }
            ```

### Scenario 1.3: Awaiting Owner Name - Complete Onboarding
*   **Pre-conditions**: Document `onboarding/919999999999` contains `{"step": "awaiting_owner_name", "language": "english", "shopName": "Metro Kirana Store"}`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_103",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "Ramesh Kumar" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Delete `onboarding/919999999999`
        *   Create `shops/919999999999/profile/info` with:
            ```json
            {
              "shopName": "Metro Kirana Store",
              "ownerName": "Ramesh Kumar",
              "language": "english",
              "phone": "919999999999",
              "updatedAt": "serverTimestamp()"
            }
            ```
        *   Create default billing structure: `billing: { "status": "trial", "trialStartedAt": "serverTimestamp()" }`
    *   **Outbound WhatsApp Message (Mock)**:
        *   **POST**: `https://graph.facebook.com/v20.0/1234567890/messages`
        *   **Body**:
            ```json
            {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "919999999999",
              "type": "text",
              "text": { "body": "Welcome Ramesh! 🎉\nMetro Kirana Store is ready on Kirana AI.\n\nTry these:\n• add 10 soaps\n• sold 5 chips\n• show inventory\n• today report" }
            }
            ```

### Scenario 1.4: Telugu User - Initial Greeting in Telugu (Start Onboarding)
*   **Pre-conditions**: No profile at `shops/918888888888/profile/info`. No document at `onboarding/918888888888`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_104",
                  "from": "918888888888",
                  "type": "text",
                  "text": { "body": "namaskaram" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Create `onboarding/918888888888` with:
        ```json
        {
          "step": "awaiting_shop_name",
          "language": "telugu"
        }
        ```
    *   **Outbound WhatsApp Message (Mock)**:
        *   **POST**: `https://graph.facebook.com/v20.0/1234567890/messages`
        *   **Body**:
            ```json
            {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "918888888888",
              "type": "text",
              "text": { "body": "Kirana AI ki swaagatam! 👋\nMee shop peru cheppagalaru?" }
            }
            ```

### Scenario 1.5: Hindi User - Initial Greeting in Hindi (Start Onboarding)
*   **Pre-conditions**: No profile at `shops/917777777777/profile/info`. No document at `onboarding/917777777777`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_105",
                  "from": "917777777777",
                  "type": "text",
                  "text": { "body": "namaste" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Create `onboarding/917777777777` with:
        ```json
        {
          "step": "awaiting_shop_name",
          "language": "hindi"
        }
        ```
    *   **Outbound WhatsApp Message (Mock)**:
        *   **POST**: `https://graph.facebook.com/v20.0/1234567890/messages`
        *   **Body**:
            ```json
            {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "917777777777",
              "type": "text",
              "text": { "body": "Kirana AI mein swagat! 👋\nApka shop ka naam kya hai?" }
            }
            ```

---

## 2. WhatsApp Signatures
Verifies that all incoming webhook posts are signature-validated to ensure they originate from Meta.

### Scenario 2.1: Valid GET Webhook Subscription Verification (Verify Token)
*   **Pre-conditions**: Server is configured with environment variable `WHATSAPP_VERIFY_TOKEN=KIRANA_SECRET`.
*   **Trigger (Input)**:
    *   **Method / Path**: `GET /api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=KIRANA_SECRET&hub.challenge=1158201444`
    *   **Headers**: None
    *   **Payload**: None
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` with plain-text body containing: `1158201444`
    *   **Firestore Changes**: None

### Scenario 2.2: Valid POST Text Message Signature Verification
*   **Pre-conditions**: Registered user profile exists at `shops/919999999999/profile/info`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: 
        *   `x-hub-signature-256: sha256=256_HEX_HMAC_DIGEST_OF_RAW_BODY_WITH_SECRET` (Calculated using the configured app secret)
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_sig_202",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "show inventory" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None (inventory display only reads state)
    *   **Outbound WhatsApp Message (Mock)**: Dispatches inventory list message successfully.

### Scenario 2.3: Valid POST Interactive Button Signature Verification
*   **Pre-conditions**: Registered user profile exists.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: 
        *   `x-hub-signature-256: sha256=256_HEX_HMAC_DIGEST_OF_RAW_BODY_WITH_SECRET`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_sig_203",
                  "from": "919999999999",
                  "type": "interactive",
                  "interactive": {
                    "type": "button_reply",
                    "button_reply": { "id": "menu_inventory", "title": "📦 View Stock" }
                  }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None

### Scenario 2.4: Valid POST Status Update Signature Verification (Ignored Event)
*   **Pre-conditions**: None.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: 
        *   `x-hub-signature-256: sha256=256_HEX_HMAC_DIGEST_OF_RAW_BODY_WITH_SECRET`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "statuses": [{
                  "id": "msg_id_sent_204",
                  "status": "delivered",
                  "timestamp": "1720584000",
                  "recipient_id": "919999999999"
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Signature validated, skipped processing since there is no message text or sender).
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**: No outgoing message sent.

### Scenario 2.5: Valid POST Media Message Signature Verification
*   **Pre-conditions**: None.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: 
        *   `x-hub-signature-256: sha256=256_HEX_HMAC_DIGEST_OF_RAW_BODY_WITH_SECRET`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "msg_id_media_205",
                  "from": "919999999999",
                  "type": "image",
                  "image": {
                    "mime_type": "image/jpeg",
                    "sha256": "abcdef...",
                    "id": "media_id_301"
                  }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Verified signature, message is ignored because it contains no message text).
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**: No outgoing message sent.

---

## 3. Webhook Idempotency
Verifies that redundant or retried Meta messages are not processed multiple times, safeguarding database transactions.

### Scenario 3.1: Unique Message (First Delivery)
*   **Pre-conditions**: Registered user profile exists. No document exists in the database under `webhook_receipts/unique_id_301`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "unique_id_301",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "add 10 soaps" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Create `webhook_receipts/unique_id_301` with:
            ```json
            { "processedAt": "serverTimestamp()" }
            ```
        *   Increment `shops/919999999999/inventory/soaps` quantity.
        *   Create logs under `shops/919999999999/logs`.
    *   **Outbound WhatsApp Message (Mock)**: Confirms the stock addition.

### Scenario 3.2: Duplicate Text Message (Second Delivery)
*   **Pre-conditions**: Registered user profile exists. A document already exists at `webhook_receipts/unique_id_301`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "unique_id_301",
                  "from": "919999999999",
                  "type": "text",
                  "text": { "body": "add 10 soaps" }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Message is skipped)
    *   **Firestore Changes**: None (no duplicate stock increment or duplicate transaction log entries)
    *   **Outbound WhatsApp Message (Mock)**: No outgoing message sent (does not spam user with duplicate responses).

### Scenario 3.3: Duplicate Interactive Button (Second Delivery)
*   **Pre-conditions**: Registered user profile exists. Document exists at `webhook_receipts/unique_button_303`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`, `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "object": "whatsapp_business_account",
          "entry": [{
            "changes": [{
              "value": {
                "messages": [{
                  "id": "unique_button_303",
                  "from": "919999999999",
                  "type": "interactive",
                  "interactive": {
                    "type": "button_reply",
                    "button_reply": { "id": "menu_inventory", "title": "📦 View Stock" }
                  }
                }]
              },
              "field": "messages"
            }]
          }]
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Skipped processing)
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**: No outgoing message sent.

### Scenario 3.4: Concurrent Webhook Requests (Transaction Lock test)
*   **Pre-conditions**: Registered user profile exists. No document exists at `webhook_receipts/concurrent_id_304`. Soaps inventory quantity is `10`.
*   **Trigger (Input)**: Simulate two parallel HTTP client calls hitting `POST /api/webhook/whatsapp` concurrently with the same body and ID `concurrent_id_304` to increment stock by `5`.
*   **Expected Outcomes**:
    *   **HTTP Response**:
        *   Request 1 (wins lock): `200 OK`
        *   Request 2 (loses lock and detects receipt): `200 OK`
    *   **Firestore Changes**:
        *   `webhook_receipts/concurrent_id_304` is created by transaction.
        *   `shops/919999999999/inventory/soaps` quantity is incremented exactly once (to `15`), not twice (to `20`).
        *   One log transaction created.
    *   **Outbound WhatsApp Message (Mock)**: Only one stock confirmation sent.

### Scenario 3.5: Multiple Consecutive Unique Messages
*   **Pre-conditions**: Registered user profile exists. `webhook_receipts` has no entries for `unique_id_A` or `unique_id_B`. Soaps inventory quantity is `10`.
*   **Trigger (Input)**:
    *   Send Request A: ID `unique_id_A` with message body `"add 5 soaps"`.
    *   Then, send Request B: ID `unique_id_B` with message body `"sold 3 soaps"`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` for both requests.
    *   **Firestore Changes**:
        *   Create `webhook_receipts/unique_id_A` and `webhook_receipts/unique_id_B`.
        *   `shops/919999999999/inventory/soaps` quantity updates: `10` -> `15` -> `12`.
        *   Two transaction logs created.
    *   **Outbound WhatsApp Message (Mock)**: Sends add success reply first, then sold success reply.

---

## 4. Razorpay Billing
Verifies account status upgrade from `"trial"` (or `"expired"`) to `"active"` upon receiving a verified billing event webhook.

### Scenario 4.1: Successful Billing Upgrade via `notes.phone`
*   **Pre-conditions**: User profile exists at `shops/919999999999/profile/info` with billing status `trial` (expired or active).
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/razorpay`
    *   **Headers**: 
        *   `x-razorpay-signature: VALID_HMAC_SHA256_HEX_DIGEST_OF_RAW_BODY`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "entity": "event",
          "account_id": "acc_1001",
          "event": "payment.captured",
          "payload": {
            "payment": {
              "entity": {
                "id": "pay_99999",
                "amount": 9900,
                "currency": "INR",
                "status": "captured",
                "notes": {
                  "phone": "919999999999"
                }
              }
            }
          }
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Returns success JSON message)
    *   **Firestore Changes**: In `shops/919999999999/profile/info` update `billing`:
        ```json
        {
          "status": "active",
          "activatedAt": "serverTimestamp()"
        }
        ```

### Scenario 4.2: Successful Billing Upgrade via `contact` field
*   **Pre-conditions**: User profile exists at `shops/919999999999/profile/info` with billing status `trial`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/razorpay`
    *   **Headers**: 
        *   `x-razorpay-signature: VALID_HMAC_SHA256_HEX_DIGEST_OF_RAW_BODY`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "entity": "event",
          "event": "payment.captured",
          "payload": {
            "payment": {
              "entity": {
                "id": "pay_88888",
                "amount": 9900,
                "currency": "INR",
                "status": "captured",
                "contact": "+919999999999",
                "notes": {}
              }
            }
          }
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Upgrades billing status to `"active"` under `shops/919999999999/profile/info`.

### Scenario 4.3: Webhook with non-captured event (e.g. `payment.failed`)
*   **Pre-conditions**: User profile exists at `shops/919999999999/profile/info` with status `trial`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/razorpay`
    *   **Headers**: 
        *   `x-razorpay-signature: VALID_HMAC_SHA256_HEX_DIGEST_OF_RAW_BODY`
        *   `Content-Type: application/json`
    *   **Payload**:
        ```json
        {
          "entity": "event",
          "event": "payment.failed",
          "payload": {
            "payment": {
              "entity": {
                "id": "pay_77777",
                "amount": 9900,
                "status": "failed",
                "notes": {
                  "phone": "919999999999"
                }
              }
            }
          }
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK` (Signature is valid, so endpoint returns success but takes no upgrade action)
    *   **Firestore Changes**: Billing status remains `"trial"` (no modifications).

### Scenario 4.4: Upgrade for a phone number with country-code cleanup
*   **Pre-conditions**: Shop profile exists at `shops/919999999999/profile/info` with status `trial`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/razorpay`
    *   **Headers**: `x-razorpay-signature: VALID_HMAC_SHA256_HEX_DIGEST_OF_RAW_BODY`
    *   **Payload**:
        ```json
        {
          "entity": "event",
          "event": "payment.captured",
          "payload": {
            "payment": {
              "entity": {
                "id": "pay_66666",
                "notes": {
                  "phone": "+91 99999-99999"
                }
              }
            }
          }
        }
        ```
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Upgrades billing status to `"active"` for `919999999999` (properly parses and normalizes phone number formats).

### Scenario 4.5: Upgrade message response from upgraded user (End-to-End lifecycle)
*   **Pre-conditions**: Shop profile `shops/919999999999/profile/info` has an expired trial status (e.g. status `trial` with `trialStartedAt` set to 8 days ago).
*   **Trigger (Input)**:
    *   Phase 1: User sends message `"add 10 soaps"`.
    *   Phase 2: System blocks the request, sending the UPI deep link/QR Code response.
    *   Phase 3: Webhook receives Razorpay `payment.captured` event for `919999999999`.
    *   Phase 4: User sends message `"add 10 soaps"` again.
*   **Expected Outcomes**:
    *   Phase 2 Outbound WhatsApp: Image QR URL of UPI payment and trial expired text.
    *   Phase 3 HTTP Response: `200 OK`, billing status becomes `"active"` in Firestore.
    *   Phase 4 Outbound WhatsApp: "Added 10 soaps! 📦 Total stock: 10" (access is now allowed).

---

## 5. Inventory ADD/SELL/Fuzzy
Verifies natural language parsing of stock changes (via regex or LLM fallback), inventory database transactions, and fuzzy merging.

### Scenario 5.1: Inventory ADD - New Item
*   **Pre-conditions**: Profile exists. `shops/919999999999/inventory` is empty.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Headers**: `x-hub-signature-256: sha256=VALID_HMAC_SIGNATURE`
    *   **Payload**: User sends `"add 10 soaps"` with message ID `msg_inv_501`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Create `shops/919999999999/inventory/soaps` with:
            ```json
            { "name": "soaps", "quantity": 10, "unit": "" }
            ```
        *   Add `"soaps"` to `pendingPriceFor` array in `profile/info`.
        *   Create document in logs collection with action `"ADD"`, item `"soaps"`, qty `10`, unit `""`, price `0`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message 1**: `Added 10 soaps! 📦 Total stock: 10`
        *   **Message 2** (Price Prompt): `What is the selling price of Soaps? (e.g. reply: 40)`

### Scenario 5.2: Inventory SELL - Sufficient Stock
*   **Pre-conditions**: `shops/919999999999/inventory/soaps` has quantity `15`, price `20`, unit `"pcs"`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"sold 5 soaps"` with message ID `msg_inv_502`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Update `shops/919999999999/inventory/soaps` quantity to `10`.
        *   Add log: action `"SELL"`, item `"soaps"`, qty `5`, unit `"pcs"`, price `20`, revenue `100`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Sold 5 pcs soaps! 🛒 Remaining: 10 pcs`

### Scenario 5.3: Inventory ADD with Fuzzy Match Merging (First Word Match)
*   **Pre-conditions**: `shops/919999999999/inventory/santoor` exists with quantity `5`, price `15`, unit `"pcs"`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"add 5 santoor soap"` with message ID `msg_inv_503`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Fuzzy match resolves `"santoor soap"` -> `"santoor"`.
        *   Update `shops/919999999999/inventory/santoor` quantity to `10`.
        *   Add log: action `"ADD"`, item `"santoor"`, qty `5`, unit `"pcs"`, price `15`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Added 5 pcs to 'santoor'! 📦 (I matched 'santoor soap' → 'santoor') Total: 10`

### Scenario 5.4: Inventory SELL - Unit Preservation
*   **Pre-conditions**: `shops/919999999999/inventory/oil` exists with quantity `10`, unit `"ltr"`, price `120`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"sold 3 oil"` (no unit provided in message) with message ID `msg_inv_504`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Update `shops/919999999999/inventory/oil` quantity to `7`, unit remains `"ltr"`.
        *   Add log: action `"SELL"`, item `"oil"`, qty `3`, unit `"ltr"`, price `120`, revenue `360`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Sold 3 ltr Oil! 🛒 Remaining: 7 ltr`

### Scenario 5.5: Inventory ADD - Bulk Add
*   **Pre-conditions**: Inventory is empty.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"add 10 soaps and 5 chips"` with message ID `msg_inv_505`. (Evaluates to bulk_add intent)
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Create `soaps` document in inventory with quantity `10`.
        *   Create `chips` document in inventory with quantity `5`.
        *   Add logs for both additions.
        *   Update `pendingPriceFor` queue to `["soaps", "chips"]`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message 1**:
            ```
            Stock updated! 📦
            Added 10 soaps! 📦 Total stock: 10
            Added 5 chips! 📦 Total stock: 5
            ```
        *   **Message 2** (First item price prompt): `What is the selling price of Soaps? (e.g. reply: 40)`

---

## 6. Price Queue
Verifies the automated price setup prompts and queuing logic for newly introduced items.

### Scenario 6.1: Queue Ingestion on Add
*   **Pre-conditions**: Profile exists. `pendingPriceFor` array is empty or non-existent in `shops/919999999999/profile/info`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"add 20 surf excel"` with message ID `msg_pr_601`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Creates inventory item `surf excel`.
        *   Updates `shops/919999999999/profile/info` doc field `pendingPriceFor` to `["surf excel"]`.
    *   **Outbound WhatsApp Message (Mock)**: Prompts for the price of `surf excel`: `What is the selling price of Surf excel? (e.g. reply: 40)`

### Scenario 6.2: Single Price Confirmation
*   **Pre-conditions**: Profile has `pendingPriceFor: ["surf excel"]`. Inventory doc `surf excel` has no price.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"50"` (the price) with message ID `msg_pr_602`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Sets `price: 50` in `shops/919999999999/inventory/surf excel`.
        *   Deletes or empties `pendingPriceFor` field in profile.
    *   **Outbound WhatsApp Message (Mock)**: Confirms the price: `✅ Surf excel price saved: ₹50`

### Scenario 6.3: Multiple Items Queued - Price Processing (First Item)
*   **Pre-conditions**: Profile has `pendingPriceFor: ["soaps", "chips"]`. Inventory docs `soaps` and `chips` have no prices.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"40"` with message ID `msg_pr_603`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Sets `price: 40` in `shops/919999999999/inventory/soaps`.
        *   Updates `pendingPriceFor` queue in profile to `["chips"]`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ Soaps price saved: ₹40\nWhat is the selling price of Chips? (e.g. reply: 40)`

### Scenario 6.4: Multiple Items Queued - Price Processing (Second Item)
*   **Pre-conditions**: Profile has `pendingPriceFor: ["chips"]`. Inventory `chips` has no price.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"20"` with message ID `msg_pr_604`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Sets `price: 20` in `shops/919999999999/inventory/chips`.
        *   Deletes `pendingPriceFor` field from profile document.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ Chips price saved: ₹20`

### Scenario 6.5: Direct Price Set Command (Bypassing Queue)
*   **Pre-conditions**: Profile has empty price queue. `soaps` exists in inventory with price `15`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"price of soaps is 35"` with message ID `msg_pr_605`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   Updates `price: 35` in `shops/919999999999/inventory/soaps`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ Soaps price updated to ₹35`

---

## 7. Queries & Reports
Verifies alphabetical stock listings and daily revenue calculation summaries.

### Scenario 7.1: View Stock - Populated Inventory
*   **Pre-conditions**: Inventory has two items: `soaps` (10 pcs) and `chips` (5 pkts).
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"show inventory"` with message ID `msg_qr_701`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**:
            ```
            📦 chips: 5 pkts
            📦 soaps: 10 pcs
            ```
            (Note: Output sorted alphabetically).

### Scenario 7.2: View Stock - Empty Inventory
*   **Pre-conditions**: Inventory collection has no items or all items are at `quantity: 0`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"stock list"` with message ID `msg_qr_702`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Stock emi ledu 📭`

### Scenario 7.3: Today's Report - Multiple Sales with Prices
*   **Pre-conditions**:
    *   Inventory contains:
        *   `soaps` price is `20`
        *   `chips` price is `15`
    *   Logs collection contains today's sales:
        *   `SELL` soaps, quantity `3`
        *   `SELL` chips, quantity `2`
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"today report"` with message ID `msg_qr_703`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**:
            ```
            Sulla anna, neti report idi:

            🛒 Sold Chips: 2 (₹30)
            🛒 Sold Soaps: 3 (₹60)

            💰 Mottam aaya: ₹90
            ```

### Scenario 7.4: Today's Report - No Sales Today
*   **Pre-conditions**: Logs collection has no entries for the current date. User profile language is `english`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"report"` with message ID `msg_qr_704`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `No transactions today yet! Start by adding stock 📦`

### Scenario 7.5: Today's Report - Empty with Telugu Language Context
*   **Pre-conditions**: Logs has no entries for today. User profile language is set to `telugu`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"report"` with message ID `msg_qr_705`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Neti transactions emi levu! Stock add cheyandi 📦`

---

## 8. Low Stock Alerts
Verifies immediate alerts triggered during sales and manual querying of low-stock items.

### Scenario 8.1: Immediate Low Stock Alert on Sale
*   **Pre-conditions**: `soaps` exists in inventory with quantity `8`, unit `"pcs"`, price `15`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"sold 4 soaps"` with message ID `msg_ls_801`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**:
        *   `soaps` quantity becomes `4`.
        *   Add log: action `"SELL"`, item `"soaps"`, qty `4`, unit `"pcs"`, price `15`, revenue `60`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ Sold 4 pcs soaps! 🛒 Remaining: 4 pcs\n⚠️ Low stock: soaps only 4 left — reorder soon!`

### Scenario 8.2: Low Stock List Query - Populated List
*   **Pre-conditions**: Owner's name is `"Ravi"`. Inventory has `soaps` (quantity `3`, unit `"pcs"`) and `chips` (quantity `8`, unit `"pkts"`).
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"low stock"` with message ID `msg_ls_802`. (Triggers check for quantity < 5)
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**:
            ```
            Ravi, items to reorder:
            ⚠️ Soaps: only 3 pcs left
            ```

### Scenario 8.3: Low Stock List Query - All Good Stock (Empty Alert)
*   **Pre-conditions**: Owner is `"Ravi"`. All inventory items have quantity >= 5.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"takkuva stock"` with message ID `msg_ls_803`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: None
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `Ravi, all items have good stock! 🟢`

### Scenario 8.4: Low Stock Alert with Telugu Language Context
*   **Pre-conditions**: User language is `telugu`. Inventory has `soaps` (quantity `9`, unit `"pcs"`, price `15`).
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"sold 5 soaps"` with message ID `msg_ls_804`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: `soaps` quantity becomes `4`.
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ 5 pcs soaps ammamu! 🛒 Migilina stock: 4 pcs\n⚠️ Stock takkuva: soaps kevalam 4 pcs undhi — tvaraga order ivvandi!`

### Scenario 8.5: Low Stock Alert at Zero Stock (Out of Stock)
*   **Pre-conditions**: Inventory has `soaps` (quantity `3`, unit `"pcs"`, price `15`).
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"sold 5 soaps"` with message ID `msg_ls_805`.
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: `soaps` quantity becomes `0` (clamped to 0).
    *   **Outbound WhatsApp Message (Mock)**:
        *   **Message**: `✅ Sold 5 pcs soaps! 🛒 Remaining: 0 pcs\n⚠️ Low stock: soaps only 0 left — reorder soon!`

---

## 9. Language Detection
Verifies the detection of Telugu and Hindi message keywords and the dynamic switching of user profile settings.

### Scenario 9.1: Automatic Language Switch to Telugu
*   **Pre-conditions**: Profile exists with language set to `english`. Owner is `"Ramesh"`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"anna stock list cheppu"` with message ID `msg_ld_901`. ("anna" and "cheppu" trigger Telugu detection)
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Updates `language: "telugu"` in `shops/919999999999/profile/info`.
    *   **Outbound WhatsApp Message (Mock)**: Responds in Telugu:
        ```
        Ramesh anna, mee inventory idi:
        ...
        ```

### Scenario 9.2: Automatic Language Switch to Hindi
*   **Pre-conditions**: Profile exists with language set to `english`. Owner is `"Ramesh"`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"bhai stock dikao"` with message ID `msg_ld_902`. ("bhai" triggers Hindi detection)
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Updates `language: "hindi"` in `shops/919999999999/profile/info`.
    *   **Outbound WhatsApp Message (Mock)**: Responds in Hindi:
        ```
        Ramesh bhai, aapki inventory:
        ...
        ```

### Scenario 9.3: Telugu Language Retention
*   **Pre-conditions**: Profile exists with language set to `telugu`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"add 10 soaps"` with message ID `msg_ld_903`. (Input matches English format, but there is no block to dynamically revert profile language to English)
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Language remains `telugu` in the profile database.
    *   **Outbound WhatsApp Message (Mock)**: Responds in Telugu:
        ```
        10 soaps add chesamu! 📦 Meeru unna stock: 10
        ```

### Scenario 9.4: Multi-lingual Input Detection (Telugu Priority)
*   **Pre-conditions**: Profile exists with language set to `english`.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"namaste anna"` with message ID `msg_ld_904`. ("namaste" matches Hindi regex, "anna" matches Telugu regex. Telugu regex check occurs first in parser logic).
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Updates `language: "telugu"` in `shops/919999999999/profile/info`.
    *   **Outbound WhatsApp Message (Mock)**: Responds in Telugu.

### Scenario 9.5: Language Switch during Onboarding (Initial Contact)
*   **Pre-conditions**: No profile, no onboarding document exists.
*   **Trigger (Input)**:
    *   **Method / Path**: `POST /api/webhook/whatsapp`
    *   **Payload**: User sends `"namaste"` with message ID `msg_ld_905`. ("namaste" triggers Hindi detection).
*   **Expected Outcomes**:
    *   **HTTP Response**: `200 OK`
    *   **Firestore Changes**: Creates `onboarding/919999999999` with:
        ```json
        {
          "step": "awaiting_shop_name",
          "language": "hindi"
        }
        ```
    *   **Outbound WhatsApp Message (Mock)**: Responds with Hindi onboarding prompt: `Kirana AI mein swagat! 👋\nApka shop ka naam kya hai?`
