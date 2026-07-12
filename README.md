# 🛒 KiranaAI — Multilingual WhatsApp Inventory Bot

KiranaAI is an inventory management assistant for small shop owners (kirana shops) in India. Shopkeepers manage stock by sending plain WhatsApp messages in **English, Hindi, or Telugu** (transliterated).

**Zero dependencies except WhatsApp.** No AI API, no cloud database, no payment gateway — and **zero npm runtime dependencies**: the server is built on `node:http` and runs as plain TypeScript on Node 22.18+ (native type stripping). The only outbound calls are to the WhatsApp Cloud API to send replies. There is even an [offline chat mode](#-try-it-without-whatsapp) that needs no WhatsApp at all.

<div align="center">
  <img src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" alt="KiranaAI Banner" width="100%">
</div>

## ✨ How It Works

1. **WhatsApp message in**: "10 sabun aaya" (Hindi) or "5 biscuit ammamu" (Telugu) or "add 10 soaps".
2. **Hybrid language understanding**: deterministic rules extract the structured parts (quantities, units, prices, item names — with fuzzy matching, "santoor" → "Santoor Soap"), while a **locally-trained ML classifier** (char-n-gram Naive Bayes, 99% held-out accuracy) understands the unstructured parts: intent and language across the unstable romanized spellings and rich verb morphology of Telugu/Hindi ("neti/ivala/eeroju report", "amm-anu/-indi/-aru"). It also **learns online** from your own phrasing, stored locally. See [docs/NLP.md](docs/NLP.md) for the linguistics research and design.
3. **Local JSON store**: inventory, transaction logs, and shop profiles are persisted atomically to `data/store.json` on your own machine.
4. **Instant reply**: confirmation with updated stock totals, in the user's language, with quick-action buttons.

## 🤖 The Agent — your shop's business brain

Beyond commands, KiranaAI runs **local predictive analytics** over your own 90-day
transaction history — no LLM, no API, no cost. Every insight is an **action or a rupee**,
delivered as one calm **daily briefing** (`summary 9pm` to schedule it) plus on-demand commands:

* **Smart reorder** (`order list`): sales-velocity forecasting — `🔴 Lux: ~5/day, 8 left (~1.5d) → order ~40`. Attacks the #1 kirana killer: stockouts of fast-movers.
* **Dead-stock / capital alert** (`dead stock`): items not selling, ranked by rupees tied up — `🟡 Detergent: no sale in 24d, ₹1,350 stuck → discount or return`.
* **Khata collection** (`udhaar reminders`): overdue credit + a ready-to-forward reminder drafted in the customer's language.
* **Demand nudges**: weekend "stock up your bestsellers" + fixed-date festival heads-ups (Sankranti, Christmas, …), folded into the briefing.

The agent *warms up* — velocity insights need ~a week of sales; until then it says so rather than guessing. It's honest AI: a trained classifier understands the shopkeeper, and statistics on real data drive the recommendations.

## 🚀 Features

* **Multilingual**: understands and replies in Hindi, Telugu, and English — general phrasing, not fixed keywords ("aaj ki kamai batao", "ivala ammakalu enta", "kya khatam hone wala hai" all work).
* **Natural language**: "stok dikhao", "5 chips becha", number words ("das sabun aaya", "rendu kg pappu"), "sold: / 2 parle g" multi-line entries, bulk lines ("added 10 soap 5 chips 2 kg sugar"), decimal quantities ("2.5 kg dal").
* **Self-learning**: a local Naive Bayes model (no AI API) classifies intent/language and keeps learning from your own messages; retrain anytime with `npm run train`.
* **Khata (udhaar) ledger**: track customer credit like the paper notebook — "ramesh udhaar 50", "ramesh ne 30 diya", "udhaar list" shows who owes what.
* **Prices & reports**: asks for the price of new items, tracks revenue; daily, weekly ("hafte ka report") and monthly reports with best-seller highlights.
* **Bulk CSV import**: send a CSV file (`item,quantity,unit,price`) as a WhatsApp document to load hundreds of SKUs at once instead of typing each one — for shops with large, varied inventory (multiple brands/variants/pack sizes per category).
* **Voice notes (offline, no API)**: send a WhatsApp voice note ("10 soap sold, 2 ice cream sold, 4 kg rice added") and a local [faster-whisper](https://github.com/SYSTRAN/faster-whisper) model transcribes it (GPU-accelerated, CPU fallback) — the bot echoes "🎤 Heard: …" so you can verify, then records each item. No cloud, no key, no quota. Requires Python + `pip install faster-whisper` (see [Voice setup](#-voice-setup)).
* **Undo & corrections**: "undo" / "galti ho gayi" reverses the last entry; "soap stock 25 karo" sets an absolute quantity; "remove chips" deletes an item.
* **Low-stock alerts**: warns when an item drops below the threshold and lists items to reorder.
* **Interactive buttons**: View Stock / Today's Report / Low Stock menus.
* **Hardened webhook**: Meta signature verification (`x-hub-signature-256`), message-ID deduplication, malformed-JSON handling.
* **Optional local billing**: free-trial gating with manual admin activation via WhatsApp (`activate <phone>`) — no payment gateway involved. Disabled by default.

## 🛠️ Tech Stack

* **Runtime**: Node.js 22.18+ — TypeScript runs natively (type stripping), strict mode
* **Server**: `node:http` (no framework)
* **ML**: hand-rolled Naive Bayes over char n-grams, trained locally (`src/ml/`)
* **Storage**: local JSON file with atomic debounced writes (`data/store.json`)
* **Messaging**: WhatsApp Cloud API (Meta) via built-in `fetch`

**Runtime npm dependencies: none.** (`typescript` and `@types/node` are dev-only, for `npm run lint`.)

## 💬 Try it without WhatsApp

The bot works out of the box with no credentials, no webhook, no tunnel, no internet:

```bash
git clone https://github.com/vishnu0496/Kirana-AI.git
cd Kirana-AI
npm run chat
```

```
You: hi
🤖 Welcome to Kirana AI! 👋  What is your shop name?
You: das sabun aaya
🤖 ✅ 10 Sabun add ho gaya! 📦 Total stock: 10
You: aaj ki kamai batao
🤖 Vishnu bhai, aaj ki report: … 💰 Kul kamai: ₹60
```

Same brain (parser + ML + store) as the WhatsApp server — outbound messages are printed to the terminal instead.

## 📦 Setup (WhatsApp)

### Prerequisites

* Node.js v22.18+ (v24 recommended)
* A Meta Developer account with WhatsApp Cloud API configured

### Installation

```bash
git clone https://github.com/vishnu0496/Kirana-AI.git
cd Kirana-AI
cp .env.example .env   # fill in your WhatsApp credentials
npm run dev            # or just: node server.ts
```

(No `npm install` needed to run — only for the dev tooling: `npm install` then `npm run lint` / `npm test`.)

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

## 🎙️ Voice setup

Voice notes are transcribed **locally** by [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — no API, key, or quota.

```bash
pip install faster-whisper
# Optional GPU (NVIDIA): pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
```

Config (in `.env`):

| Variable | Purpose |
|---|---|
| `WHISPER_MODEL` | `small` / `medium` / `large-v3` (default `large-v3`; smaller = faster, less accurate) |
| `PYTHON` | Path to the Python that has `faster-whisper` (default `python`) |
| `WHISPER_LANGUAGE` | Optional language hint, e.g. `te` / `hi` (usually auto-detected) |

The server shells out to `transcribe.py`, which uses the GPU when available and falls back to CPU. First run downloads the model, then it's fully offline.

## 🧪 Tests & checks

```bash
npm run lint   # TypeScript strict typecheck
npm test       # parser + ML generalization unit tests, e2e webhook tests (mock WhatsApp server)
npm run train  # retrain the intent/language model, prints held-out accuracy
```

The e2e suite spawns the real server against a mock WhatsApp Cloud API and exercises onboarding, stock updates, the price queue, reports, signature rejection, and deduplication — no external services needed.

## 📜 License

MIT
