## 2026-07-10T04:38:02Z

You are a read-only exploration agent. Your working directory is:
c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\
Your identity is: teamwork_preview_explorer (Explorer 1)

Your task is to explore the codebase at c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\ to design the implementation of Milestone 1 (Razorpay Webhook Billing Integration).

Please read the scope document here:
c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\sub_orch_m1\SCOPE.md

Specific instructions:
1. Examine the project environment. Identify:
   - Backend framework (e.g. Next.js, Express)
   - Firestore configuration and client/SDK setup
   - Package manager and project dependencies
2. Locate where API routes are handled and where the Razorpay webhook endpoint should be implemented.
3. Detail how to extract the shop's phone number from payment.captured event notes or payload.
4. Detail the signature verification using HMAC hex digest with SHA256 of the raw request body and RAZORPAY_WEBHOOK_SECRET.
5. Design the Firestore update logic for shops/{phone}/profile/info (setting status to "active" and activatedAt to the current time).
6. Outline the structure of the verification script scratch/test-razorpay-webhook.ts. How should it simulate the webhook request, calculate a valid signature, and verify the shop status change in Firestore?
7. Write your findings to:
   c:\Users\Vishnu\Desktop\vishnu\kirana-ai---whatsapp-inventory-bot\.agents\teamwork_preview_explorer_m1_1_1\handoff.md
8. Send a message back to the parent (conversation ID: 78d90806-4804-44d3-8200-76fdfa10d53f) when done, referencing handoff.md.

Note: You are read-only. DO NOT write or edit code files outside of your own working directory (.agents/...).
