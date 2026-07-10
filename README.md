# 🛒 KiranaAI — Multilingual WhatsApp Inventory Bot

KiranaAI is an inventory management assistant for small shop owners (kirana shops) in India. Shopkeepers manage stock by sending plain WhatsApp messages in **English, Hindi, or Telugu** (transliterated).

**Zero external dependencies except WhatsApp.** No AI API, no cloud database, no payment gateway — everything runs locally on your server. The only outbound calls are to the WhatsApp Cloud API to send replies.

<div align="center">
  <img src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" alt="KiranaAI Banner" width="100%">
</div>

## ✨ How It Works

1. **WhatsApp message in**: "10 sabun aaya" (Hindi) or "5 biscuit ammamu" (Telugu) or "add 10 soaps".
2. **Hybrid language understanding**: deterministic rules extract the structured parts (quantities, units, prices, item names — with fuzzy matching, "santoor" → "Santoor Soap"), while a **locally-trained ML classifier** (char-n-gram Naive Bayes, 99% held-out accuracy) understands the unstructured parts: intent and language across the unstable romanized spellings and rich verb morphology of Telugu/Hindi ("neti/ivala/eeroju report", "amm-anu/-indi/-aru"). It also **learns online** from your own phrasing, stored locally. See [docs/NLP.md](docs/NLP.md) for the linguistics research and design.
3. **Local JSON store**: inventory, transaction logs, and shop profiles are persisted atomically to `data/store.json` on your own machine.
4. **Instant reply**: confirmation with updated stock totals, in the user's language, with quick-action buttons.

## 🚀 Features

* **Multilingual**: understands and replies in Hindi, Telugu, and English — general phrasing, not fixed keywords ("aaj ki kamai batao", "ivala ammakalu enta", "kya khatam hone wala hai" all work).
* **Natural language**: "stok dikhao", "5 chips becha", number words ("das sabun aaya", "rendu kg pappu"), "sold: / 2 parle g" multi-line entries, bulk lines ("added 10 soap 5 chips 2 kg sugar"), decimal quantities ("2.5 kg dal").
* **Self-learning**: a local Naive Bayes model (no AI API) classifies intent/language and keeps learning from your own messages; retrain anytime with `npm run train`.
* **Prices & reports**: asks for the price of new items, tracks revenue, daily sales report.
* **Low-stock alerts**: warns when an item drops below the threshold and lists items to reorder.
* **Interactive buttons**: View Stock / Today's Report / Low Stock menus.
* **Hardened webhook**: Meta signature verification (`x-hub-signature-256`), message-ID deduplication, malformed-JSON handling.
* **Optional local billing**: free-trial gating with manual admin activation via WhatsApp (`activate <phone>`) — no payment gateway involved. Disabled by default.

## 🛠️ Tech Stack

* **Runtime**: Node.js 18+ (TypeScript, strict mode, run with `tsx`)
* **Server**: Express.js
* **Storage**: local JSON file with atomic debounced writes (`data/store.json`)
* **Messaging**: WhatsApp Cloud API (Meta) via built-in `fetch`

Total production dependencies: `express`, `tsx`, `typescript`. That's it.

## 📦 Setup

### Prerequisites

* Node.js v18+ (v22 recommended)
* A Meta Developer account with WhatsApp Cloud API configured

### Installation

```bash
git clone https://github.com/vishnu0496/Kirana-AI.git
cd Kirana-AI
npm install
cp .env.example .env   # fill in your WhatsApp credentials
npm run dev
```

Point your WhatsApp webhook to `https://your-server-url/api/webhook/whatsapp` using the `WHATSAPP_VERIFY_TOKEN` you chose. Set `WHATSAPP_APP_SECRET` so incoming webhooks are signature-verified.

### Configuration

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_TOKEN` | ✅ | Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | Your WhatsApp phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Webhook verification handshake secret |
| `WHATSAPP_APP_SECRET` | recommended | Verifies webhook payload signatures |
| `PORT` | — | Default `3000` |
| `DATA_DIR` | — | Store location, default `./data` |
| `LOW_STOCK_THRESHOLD` | — | Default `5` |
| `BILLING_ENABLED` | — | Default `false` (everyone has full access) |
| `TRIAL_DAYS`, `ADMIN_PHONE`, `MERCHANT_UPI_ID`, `SUPPORT_CONTACT` | — | Only used when billing is enabled |

### Docker

```bash
docker build -t kirana-ai .
docker run -p 8080:8080 --env-file .env -v kirana-data:/app/data kirana-ai
```

## 🧪 Tests & checks

```bash
npm run lint   # TypeScript strict typecheck
npm test       # parser + ML generalization unit tests, e2e webhook tests (mock WhatsApp server)
npm run train  # retrain the intent/language model, prints held-out accuracy
```

The e2e suite spawns the real server against a mock WhatsApp Cloud API and exercises onboarding, stock updates, the price queue, reports, signature rejection, and deduplication — no external services needed.

## 📜 License

MIT
