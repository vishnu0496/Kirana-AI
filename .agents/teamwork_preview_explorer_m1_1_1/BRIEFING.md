# BRIEFING — 2026-07-10T04:40:00Z

## Mission
Explore the codebase to design the implementation of Milestone 1 (Razorpay Webhook Billing Integration).

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Explorer 1, read-only investigation
- Working directory: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\
- Original parent: 78d90806-4804-44d3-8200-76fdfa10d53f
- Milestone: Milestone 1 - Razorpay Webhook Billing Integration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement. No writing/editing code files outside of own working directory.
- Code-only network restrictions: No external network/HTTP clients.

## Current Parent
- Conversation ID: 78d90806-4804-44d3-8200-76fdfa10d53f
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `package.json`
  - `PROJECT.md`
  - `server.ts`
  - `src/database.ts`
  - `src/billing.ts`
  - `scratch/manage-billing.ts`
  - `scratch/test-idempotency.ts`
- **Key findings**:
  - Express.js and TypeScript (`tsx` run) form the backend architecture.
  - Firestore is configured using `firebase-admin` and accesses a specific database id: `kirana-inventory-db`.
  - Database helper function `setBillingStatus` is already available in `src/database.ts` and handles setting status to `"active"` and `activatedAt` to the current Firestore timestamp in the location `shops/{phone}/profile/info`.
  - Global `bodyParser.json()` in `server.ts` parses incoming request bodies. Signature verification requires the raw body, which means the Razorpay webhook endpoint route must be registered *before* the global json parser using `express.raw({ type: "application/json" })`.
  - User phone number must be extracted from `notes.phone` or `contact` inside the payment entity and normalized by stripping non-digit characters and prefixing 10-digit Indian numbers with `91` to match Firestore keys.
- **Unexplored areas**: None.

## Key Decisions Made
- Recommending adding the new Razorpay webhook POST route directly in `server.ts` before the global body parser.
- Recommending reusing the existing database helper `setBillingStatus` to perform Firestore updates.
- Created `proposed_server.patch` and `proposed_test-razorpay-webhook.ts` to document implementation designs.

## Artifact Index
- c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\handoff.md — Design findings and recommendations
- c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\proposed_server.patch — Patch to implement webhook endpoint in server.ts
- c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\proposed_test-razorpay-webhook.ts — Proposed scratch verification script
