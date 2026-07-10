## 2026-07-10T04:40:08Z
You are a worker agent with code modification capabilities. 
Your working directory is: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_worker_m1_1\
Your identity is: teamwork_preview_worker

Your task is to implement Milestone 1 (Razorpay Webhook Billing Integration) as defined in SCOPE.md and designed in context.md:
- Scope: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_m1\SCOPE.md
- Context/Design: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_m1\context.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT
hardcode test results, create dummy/facade implementations, or
circumvent the intended task. A Forensic Auditor will independently
verify your work. Integrity violations WILL be detected and your
work WILL be rejected.

Implementation Requirements:
1. In `server.ts`:
   - Import `crypto` (standard library).
   - Configure the global body-parser JSON middleware with a `verify` option to save the raw payload buffer on `req.rawBody`:
     ```typescript
     app.use(bodyParser.json({
       verify: (req: any, res, buf) => {
         req.rawBody = buf;
       }
     }));
     ```
   - Register route `POST /api/webhook/razorpay`.
   - In the route, perform HMAC SHA256 verification of `req.rawBody` using `process.env.RAZORPAY_WEBHOOK_SECRET`. Compare with signature from `x-razorpay-signature` header using `crypto.timingSafeEqual` (converting signatures to buffers of equal length first or using a secure comparison wrapper).
   - If signature matches and event is `payment.captured`, extract the phone number from notes or contact in the payment entity. Strip all non-digit characters to normalize it.
   - Verify if the shop profile exists in Firestore (retrieve via `getUser(phone)`). If not, return `404 Not Found`.
   - Update the shop's billing status to "active" using the helper function `setBillingStatus(phone, "active")`.
   - Return appropriate HTTP status codes (200 for successful upgrade, 400 for bad signatures/missing parameters/malformed payloads, 404 for non-existent shops, 500 for database error or missing secrets). Return 200 for other ignored events without database update.

2. Create `scratch/test-razorpay-webhook.ts`:
   - Set up or reuse a test shop profile with phone `919999999999` in Firestore.
   - Set its billing status to "trial" or "expired".
   - Construct a mock payment.captured event payload.
   - Compute a valid signature using HMAC SHA256 and a test secret (e.g. `test_secret`).
   - Run a POST request to `http://localhost:3000/api/webhook/razorpay` (or dynamically loaded port).
   - Verify that the response status is 200 and the shop billing status in Firestore is successfully updated to "active" with a valid `activatedAt` timestamp.
   - Also test negative scenarios (sending an invalid signature and expecting 400 Bad Request, sending unhandled events, non-existent shops).

Verification:
- You must compile the project or run a linter to ensure no syntax/TypeScript errors.
- You must start the server locally and run the `scratch/test-razorpay-webhook.ts` script to verify that both positive and negative scenarios pass.
- Record the exact commands run and the output results in your handoff report.

Handoff:
- Write your handoff report containing detailed verification evidence to `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_worker_m1_1\handoff.md`.
- Send a message back to the parent (conversation ID: 78d90806-4804-44d3-8200-76fdfa10d53f) when you are done.
