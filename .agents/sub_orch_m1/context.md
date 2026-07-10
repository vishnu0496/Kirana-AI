# Context - Razorpay Webhook Billing (Milestone 1)

## Current Workspace
- Root: `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot`
- Metadata Dir: `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_m1\`

## Technologies & Architecture
- **Backend framework**: Express.js (v4.21.2) in `server.ts`
- **Firestore client/SDK**: `firebase-admin` (v13.8.0) in `src/database.ts`
- **Package manager**: NPM (runner: `tsx` v4.21.0)
- **Database ID**: `kirana-inventory-db` (or custom env `FIREBASE_FIRESTORE_DATABASE_ID`)

## Key Paths
- **Webhook Endpoint File**: `server.ts` (target route: `POST /api/webhook/razorpay`)
- **Verification Script**: `scratch/test-razorpay-webhook.ts`
- **Firestore Update Target**: `shops/{phone}/profile/info` (via `getUser` and `setBillingStatus` helpers)

## Synthesized Design & Consensus

### 1. Raw Body Middleware Setup
In `server.ts`, we will replace `app.use(bodyParser.json())` with:
```typescript
app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
```
This is the resolved consensus approach (voted by Explorers 2 & 3). It keeps all subsequent routes' parsed JSON intact in `req.body` while making the raw payload buffer available on `req.rawBody` for signature validation.

### 2. Signature Verification
- Compare computed HMAC SHA256 of `req.rawBody` (with `process.env.RAZORPAY_WEBHOOK_SECRET`) against header `x-razorpay-signature`.
- Use a safe comparison method (e.g. `crypto.timingSafeEqual` over buffers or equivalent string compare with length checks) to guard against timing attacks.

### 3. Event and Phone Extraction
- Only process `payment.captured` event type. Other event types are acknowledged with `200 OK` and ignored.
- Extract the phone number from `payload.payment.entity.notes.phone` or `payload.payment.entity.contact`.
- Normalize the phone number using `phone.replace(/\D/g, "")` to ensure it only contains digits, aligning with the format stored in Firestore.
- Check if the user/shop exists using `getUser(phone)`. If not, return `404 Not Found` (or `400 Bad Request` with message).

### 4. Firestore Billing Status Update
- Call `await setBillingStatus(phone, "active")` which automatically updates `billing.status` to `"active"` and `billing.activatedAt` to `admin.firestore.Timestamp.now()`.

### 5. Verification Script (`scratch/test-razorpay-webhook.ts`)
- Use `axios` (already in `package.json`) to send requests.
- Seed a dummy shop `919999999999` in Firestore as `expired` or `trial`.
- Generate valid HMAC signature and send mock `payment.captured` event.
- Verify status upgrades to `active` and has `activatedAt`.
- Verify signature mismatch returns `400 Bad Request`.
