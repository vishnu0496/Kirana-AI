# Context — E2E Testing Track

## Background
We are building the E2E Testing Track for a multilingual WhatsApp Inventory Bot. The bot processes inventory messages, supports onboarding, handles signature verification, does idempotency deduplication, runs billing status checks (Razorpay webhook integration), and handles language switching.

## Key Files
- `server.ts` - Main Express server
- `package.json` - Node dependencies & scripts
- `PROJECT.md` - Master project file
- `c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_e2e\SCOPE.md` - Sub-orch scope file
- `.env` - Environment configuration

## Active Subagents
- None currently.

## Next Step
- Spawn an Explorer agent to explore the codebase and propose the E2E test infra design, including how to mock external APIs (WhatsApp/Razorpay) and database access.
