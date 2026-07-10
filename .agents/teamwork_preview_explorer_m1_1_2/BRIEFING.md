# BRIEFING — 2026-07-10T10:09:45+05:30

## Mission
Explore the codebase to design the implementation of Milestone 1 (Razorpay Webhook Billing Integration).

## 🔒 My Identity
- Archetype: explorer
- Roles: Teamwork explorer (Explorer 2)
- Working directory: c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_2\
- Original parent: 78d90806-4804-44d3-8200-76fdfa10d53f
- Milestone: Milestone 1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Verify everything, do not write code outside of .agents/

## Current Parent
- Conversation ID: 78d90806-4804-44d3-8200-76fdfa10d53f
- Updated: 2026-07-10T10:09:45+05:30

## Investigation State
- **Explored paths**:
  * `package.json`
  * `server.ts`
  * `src/database.ts`
  * `src/billing.ts`
  * `scratch/` (existing utility scripts)
  * `.env`, `.env.example`
- **Key findings**:
  * Express.js framework used with globally registered `bodyParser.json()` middleware. We must configure it to capture the `rawBody`.
  * Firestore is configured using `firebase-admin` with database ID `kirana-inventory-db` (or from env).
  * Path `shops/{phone}/profile/info` contains the shop's profile and billing status.
  * Helper `setBillingStatus(phone, status)` inside `src/database.ts` already handles status updates and records `activatedAt` correctly.
  * Phone numbers extracted from Razorpay webhook can contain non-digits (e.g. `+919999999999`) and must be normalized before querying Firestore.
- **Unexplored areas**: None.

## Key Decisions Made
- Reusing existing `setBillingStatus(phone, "active")` function in `src/database.ts`.
- Capturing raw request body in `bodyParser.json` verification hook.
- Normalizing extracted phone numbers by removing all non-digits.
- Designing a complete verification scratch script `scratch/test-razorpay-webhook.ts`.

## Artifact Index
- c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_2\handoff.md — Design handoff report
