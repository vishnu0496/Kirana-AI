import { config } from "./env.ts";
import { smartParse, detectLanguage, capitalize, explicitAction } from "./parser.ts";
import { classifyLanguage } from "./ml/index.ts";
import type { ParseResult } from "./parser.ts";
import { getReply } from "./templates.ts";
import type { Lang } from "./templates.ts";
import { checkAccess } from "./billing.ts";
import { sendText, sendButtons, downloadMedia } from "./whatsapp.ts";
import type { Button } from "./whatsapp.ts";
import * as store from "./store.ts";
import { parseInventoryCsv } from "./bulkImport.ts";

const MENU_BUTTONS: Button[] = [
  { id: "menu_inventory", title: "📦 View Stock" },
  { id: "menu_report", title: "💰 Today's Report" },
  { id: "menu_low_stock", title: "⚠️ Low Stock" },
];

const QUICK_BUTTONS: Button[] = [
  { id: "menu_inventory", title: "📦 View Stock" },
  { id: "menu_report", title: "💰 Today's Report" },
];

const BUTTON_ACTIONS: Record<string, ParseResult> = {
  menu_inventory: { action: "view_stock" },
  menu_report: { action: "report" },
  menu_low_stock: { action: "low_stock" },
};

/** Downloads, parses, and applies a CSV inventory file sent as a WhatsApp document. */
async function handleBulkImport(sender: string, lang: Lang, mediaId: string): Promise<void> {
  const reply = getReply(lang);
  const text = await downloadMedia(mediaId);
  if (!text) {
    await sendText(sender, reply.importFailed);
    return;
  }
  const { rows, skipped } = parseInventoryCsv(text);
  if (rows.length === 0) {
    await sendText(sender, reply.importFailed);
    return;
  }
  for (const row of rows) {
    store.updateStock(sender, row.item, row.quantity, "ADD", row.unit);
    if (row.price !== undefined) store.setItemPrice(sender, row.item, row.price);
  }
  await sendText(sender, reply.importSummary(rows.length, skipped));
}

/** Handle one incoming WhatsApp message (text, button tap, or document upload). */
export async function handleIncomingMessage(
  sender: string,
  messageText: string,
  buttonId: string = "",
  documentId: string = ""
): Promise<void> {
  // Admin commands: manual billing control, no payment gateway involved.
  if (config.adminPhone && sender === config.adminPhone) {
    const adminMatch = messageText.trim().match(/^(activate|deactivate)\s+(\d{10,15})$/i);
    if (adminMatch) {
      const targetPhone = adminMatch[2].length === 10 ? "91" + adminMatch[2] : adminMatch[2];
      const status = adminMatch[1].toLowerCase() === "activate" ? "active" : "expired";
      const ok = store.setBillingStatus(targetPhone, status);
      await sendText(sender, ok
        ? `✅ ${targetPhone} is now ${status}.`
        : `❌ No shop found for ${targetPhone}.`);
      if (ok && status === "active") {
        const target = store.getUser(targetPhone);
        await sendText(targetPhone, getReply(target?.language || "english").activated);
      }
      return;
    }
  }

  const profile = store.getUser(sender);
  if (!profile) {
    if (documentId) {
      await sendText(sender, "Please tell me your shop name first, then send your inventory file 🙂");
      return;
    }
    await handleOnboarding(sender, messageText);
    return;
  }

  const access = checkAccess(profile);
  if (!access.allowed) {
    const reply = getReply(profile.language);
    let text = reply.trialExpired(config.supportContact);
    if (config.merchantUpiId) {
      // UPI deep link works as tappable plain text — no QR image service needed.
      text += `\n\nupi://pay?pa=${config.merchantUpiId}&pn=KiranaAI&am=99&cu=INR&tn=Activate%20${sender}`;
    }
    await sendText(sender, text);
    return;
  }

  if (documentId) {
    await handleBulkImport(sender, profile.language || "english", documentId);
    return;
  }

  // A pending price answer is handled first, in the shop's existing language —
  // a short reply like "40/- per litre" must not be re-detected as a new language.
  let lang: Lang = profile.language || "english";
  if (!buttonId && (await handlePriceQueue(sender, messageText, getReply(lang)))) return;

  // Otherwise, switch language only on strong evidence. Weak guesses (an
  // English/number reply like "40/- per half litre" scores ~0.70 hindi) must
  // not flip an established language; genuine Telugu/Hindi scores ~1.00.
  const langPred = classifyLanguage(messageText);
  if (
    (langPred.label === "telugu" || langPred.label === "hindi") &&
    langPred.label !== lang &&
    langPred.confidence >= 0.85
  ) {
    lang = langPred.label;
    store.saveUser(sender, { language: lang });
  }

  const reply = getReply(lang);
  const ownerName = (profile.ownerName || "Owner").split(" ")[0];

  // Daily summary: "summary" / "day summary" (on demand), "summary 9pm" (set time),
  // or the local words "hisab" / "lekka" for an instant digest.
  if (!buttonId && (/\bsummary\b/i.test(messageText) || /\b(hisab|lekka)\b/i.test(messageText))) {
    const setMatch = messageText.match(/summary\s+(?:at\s+|time\s+)?(.+)/i);
    const time = setMatch ? parseTime(setMatch[1]) : null;
    if (time) {
      store.setSummaryTime(sender, time);
      await sendText(sender, reply.summarySet(formatTime(time)));
    } else {
      await sendText(sender, buildDailySummary(sender, ownerName, reply));
    }
    return;
  }

  // Button taps map directly to an action; free text goes through the parser.
  const lines = buttonId
    ? [messageText || buttonId]
    : messageText.split("\n").map((l) => l.trim()).filter(Boolean);

  const results: string[] = [];
  let hadTransaction = false;
  let hadQuery = false;
  let itemsAddedToQueue = false;
  let contextAction: "add" | "sold" | null = null;

  for (const line of lines) {
    let parsed: ParseResult = buttonId
      ? BUTTON_ACTIONS[buttonId] ?? { action: "unknown" }
      : smartParse(line);
    console.log(`[PARSE] ${line} -> ${parsed.action}`);

    if (parsed.action === "skip") {
      contextAction = explicitAction(line);
      continue;
    }

    // Header context ("sold:" on a previous line) flips verb-less updates.
    if (
      contextAction === "sold" &&
      parsed.action === "add" &&
      explicitAction(line) === null
    ) {
      parsed = { ...parsed, action: "sold" };
    }

    switch (parsed.action) {
      case "greeting":
        await sendButtons(sender, reply.greeting(ownerName), MENU_BUTTONS);
        break;

      case "help":
        results.push(reply.help);
        hadQuery = true;
        break;

      case "set_price":
        store.setItemPrice(sender, parsed.item, parsed.price);
        results.push(reply.priceUpdated(capitalize(parsed.item), parsed.price));
        hadQuery = true;
        break;

      case "low_stock": {
        const lowItems = store
          .getInventory(sender)
          .filter((i) => i.quantity < config.lowStockThreshold)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (lowItems.length === 0) {
          results.push(reply.noLowStock(ownerName));
        } else {
          results.push(reply.lowStockHeader(ownerName));
          for (const i of lowItems) results.push(reply.lowStockItem(capitalize(i.name), i.quantity, i.unit));
        }
        hadQuery = true;
        break;
      }

      case "view_stock": {
        const items = store
          .getInventory(sender)
          .filter((i) => i.quantity > 0)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((i) => `📦 ${capitalize(i.name)}: ${i.quantity}${i.unit ? " " + i.unit : ""}`);
        results.push(items.length ? items.join("\n") : reply.emptyStock);
        hadQuery = true;
        break;
      }

      case "report":
        results.push(buildReport(sender, ownerName, reply));
        hadQuery = true;
        break;

      case "week_report":
        results.push(buildReport(sender, ownerName, reply, 7));
        hadQuery = true;
        break;

      case "month_report":
        results.push(buildReport(sender, ownerName, reply, 30));
        hadQuery = true;
        break;

      case "undo": {
        const tx = store.undoLastTransaction(sender);
        if (!tx) {
          results.push(reply.nothingToUndo);
        } else {
          const newQty = store.getInventory(sender)
            .find((i) => i.name.toLowerCase() === tx.item.toLowerCase())?.quantity ?? 0;
          results.push(
            tx.action === "ADD"
              ? reply.undoneAdd(tx.quantity, capitalize(tx.item), newQty)
              : reply.undoneSell(tx.quantity, capitalize(tx.item), newQty)
          );
        }
        hadQuery = true;
        break;
      }

      case "set_stock": {
        const set = store.setQuantity(sender, parsed.item, parsed.quantity, parsed.unit);
        if (set) results.push(reply.stockSet(capitalize(set.finalItem), parsed.quantity, set.finalUnit));
        hadQuery = true;
        break;
      }

      case "remove_item": {
        const removed = store.removeItem(sender, parsed.item);
        results.push(removed ? reply.itemRemoved(capitalize(removed)) : reply.outOfStock(capitalize(parsed.item)));
        hadQuery = true;
        break;
      }

      case "khata_credit": {
        const account = store.updateKhata(sender, capitalize(parsed.customer), parsed.amount);
        if (account) results.push(reply.khataCredit(account.name, parsed.amount, account.balance));
        hadQuery = true;
        break;
      }

      case "khata_payment": {
        const existing = store.getKhataAccount(sender, parsed.customer);
        if (!existing) {
          results.push(reply.khataUnknownCustomer(capitalize(parsed.customer)));
        } else {
          const account = store.updateKhata(sender, existing.name, -parsed.amount);
          if (account) results.push(reply.khataPayment(account.name, parsed.amount, account.balance));
        }
        hadQuery = true;
        break;
      }

      case "view_khata": {
        if (parsed.customer) {
          const account = store.getKhataAccount(sender, parsed.customer);
          results.push(
            account
              ? reply.khataCustomer(account.name, account.balance)
              : reply.khataUnknownCustomer(capitalize(parsed.customer))
          );
        } else {
          const accounts = store.getKhata(sender);
          if (accounts.length === 0) {
            results.push(reply.khataEmpty);
          } else {
            results.push(reply.khataHeader(ownerName));
            for (const a of accounts) results.push(`👤 ${a.name}: ₹${a.balance}`);
            results.push(reply.khataTotal(accounts.reduce((s, a) => s + a.balance, 0)));
          }
        }
        hadQuery = true;
        break;
      }

      case "add":
      case "sold":
        if (applyStockUpdate(sender, parsed, reply, results)) itemsAddedToQueue = true;
        hadTransaction = true;
        break;

      case "bulk_add":
      case "bulk_sold": {
        const single = parsed.action === "bulk_add" ? ("add" as const) : ("sold" as const);
        for (const item of parsed.items) {
          if (applyStockUpdate(sender, { action: single, ...item }, reply, results)) {
            itemsAddedToQueue = true;
          }
        }
        hadTransaction = true;
        break;
      }

      default:
        results.push(reply.notUnderstoodLine(line));
    }
  }

  if (results.length > 0) {
    const replyText = results.join("\n");
    if (hadTransaction && !hadQuery) {
      await sendButtons(sender, replyText, QUICK_BUTTONS);
    } else {
      await sendText(sender, replyText);
    }
  }

  // Ask the price of the first newly-added item.
  if (itemsAddedToQueue) {
    const queue = store.getPriceQueue(sender);
    if (queue.length > 0) await sendText(sender, reply.askPrice(capitalize(queue[0])));
  }
}

type Reply = ReturnType<typeof getReply>;

async function handleOnboarding(sender: string, messageText: string): Promise<void> {
  const onboarding = store.getOnboardingState(sender);
  if (!onboarding) {
    const lang = detectLanguage(messageText);
    store.setOnboardingState(sender, { step: "awaiting_shop_name", language: lang });
    await sendText(sender, getReply(lang).askShopName);
  } else if (onboarding.step === "awaiting_shop_name") {
    const shopName = messageText.trim();
    store.setOnboardingState(sender, { ...onboarding, step: "awaiting_owner_name", shopName });
    await sendText(sender, getReply(onboarding.language).shopRegistered(shopName));
  } else {
    const ownerName = messageText.trim();
    store.saveUser(sender, {
      shopName: onboarding.shopName || "",
      ownerName,
      language: onboarding.language,
    });
    store.clearOnboardingState(sender);
    await sendText(sender, getReply(onboarding.language).welcomeUser(ownerName, onboarding.shopName || ""));
  }
}

/** Returns true when the message was consumed as a price-queue answer. */
async function handlePriceQueue(sender: string, messageText: string, reply: Reply): Promise<boolean> {
  const queue = store.getPriceQueue(sender);
  if (queue.length === 0) return false;

  // A price answer is a leading number (optionally ₹/rs) followed only by
  // price/unit noise like "40", "40/-", "40 rs", "40/- per half litre".
  // Anything with a real item word ("10 soap") falls through to normal parsing
  // so the user isn't trapped in the price question.
  const priceMatch = messageText.trim().match(/^(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(.*)$/i);
  const rest = priceMatch ? priceMatch[2].toLowerCase().replace(/[^a-z]+/g, " ").trim() : "x";
  const PRICE_NOISE = /^(rs|rupees?|per|each|only|half|quarter|litre|liter|ltr|l|kg|g|gram|grams|ml|packet|packets|pkt|piece|pieces|pcs|pack|dozen)$/;
  const isPriceAnswer = priceMatch && rest.split(/\s+/).filter(Boolean).every((w) => PRICE_NOISE.test(w));
  if (!isPriceAnswer) {
    const parsed = smartParse(messageText);
    if (parsed.action === "unknown") {
      await sendText(sender, reply.askPriceAgain(capitalize(queue[0])));
      return true;
    }
    return false;
  }

  const price = parseFloat(priceMatch![1]);
  const itemName = store.shiftPriceQueue(sender);
  if (!itemName) return false;

  store.setItemPrice(sender, itemName, price);
  await sendText(sender, reply.priceConfirmed(capitalize(itemName), price));

  const remaining = store.getPriceQueue(sender);
  if (remaining.length > 0) await sendText(sender, reply.askPrice(capitalize(remaining[0])));
  return true;
}

/** Apply one add/sold update. Returns true when the item was queued for pricing. */
function applyStockUpdate(
  sender: string,
  parsed: { action: "add" | "sold"; item: string; quantity: number; unit: string },
  reply: Reply,
  results: string[]
): boolean {
  const isAdd = parsed.action === "add";
  const result = store.updateStock(sender, parsed.item, parsed.quantity, isAdd ? "ADD" : "SELL", parsed.unit);

  if (!result.ok) {
    results.push(reply.outOfStock(capitalize(parsed.item)));
    return false;
  }

  store.logTransaction(sender, isAdd ? "ADD" : "SELL", result.finalItem, parsed.quantity, result.finalUnit, result.itemPrice);

  if (isAdd && result.isMerged) {
    results.push(`✅ ${reply.addSuccessWithMerge(parsed.quantity, result.finalUnit, parsed.item, capitalize(result.finalItem), result.newQty)}`);
  } else if (isAdd) {
    results.push(`✅ ${reply.addSuccess(parsed.quantity, capitalize(result.finalItem), result.newQty, result.finalUnit)}`);
  } else {
    results.push(`✅ ${reply.soldSuccess(parsed.quantity, capitalize(result.finalItem), result.newQty, result.finalUnit)}`);
  }

  if (!isAdd && result.newQty < config.lowStockThreshold) {
    results.push(reply.lowStock(capitalize(result.finalItem), result.newQty, result.finalUnit));
  }

  if (isAdd && store.getItemPrice(sender, result.finalItem) === null) {
    store.addToPriceQueue(sender, result.finalItem);
    return true;
  }
  return false;
}

interface SellEntry { qty: number; revenue: number; displayName: string }

/** Aggregate SELL transactions by item, revenue at the current price. */
function aggregateSells(sender: string, txs: ReturnType<typeof store.getTodayTransactions>): SellEntry[] {
  const sellMap: Record<string, SellEntry> = {};
  for (const t of txs) {
    if (t.action !== "SELL") continue;
    const key = t.item.toLowerCase().trim();
    if (!key) continue;
    // Prefer the current price so late price fixes correct the report.
    const currentPrice = store.getItemPrice(sender, key);
    const revenue = currentPrice != null ? currentPrice * t.quantity : t.revenue;
    sellMap[key] ??= { qty: 0, revenue: 0, displayName: t.item };
    sellMap[key].qty += t.quantity;
    sellMap[key].revenue += revenue;
  }
  return Object.values(sellMap).sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

function buildReport(sender: string, ownerName: string, reply: Reply, days?: number): string {
  const txs = days ? store.getTransactionsSince(sender, days) : store.getTodayTransactions(sender);
  const header =
    days === 7 ? reply.weekReportHeader(ownerName)
    : days === 30 ? reply.monthReportHeader(ownerName)
    : reply.reportHeader(ownerName);
  if (txs.length === 0) return reply.emptyReport;

  const entries = aggregateSells(sender, txs);
  const sellLines = entries.map(({ qty, revenue, displayName }) =>
    `🛒 ${capitalize(displayName)}: ${qty}${revenue ? ` (₹${revenue})` : ""}`
  );
  const totalRevenue = entries.reduce((sum, { revenue }) => sum + revenue, 0);

  const lines = [header, "", sellLines.length ? sellLines.join("\n") : reply.noSalesToday];
  if (entries.length >= 2) lines.push("", reply.topSeller(capitalize(entries[0].displayName)));
  lines.push("", reply.reportRevenue(totalRevenue));
  return lines.join("\n");
}

/** End-of-day digest: today's sales + revenue, items to reorder, and udhaar owed. */
function buildDailySummary(sender: string, ownerName: string, reply: Reply): string {
  const entries = aggregateSells(sender, store.getTodayTransactions(sender));
  const lines: string[] = [reply.summaryHeader(ownerName), ""];

  const sellLines = entries.map(({ qty, revenue, displayName }) =>
    `🛒 ${capitalize(displayName)}: ${qty}${revenue ? ` (₹${revenue})` : ""}`
  );
  lines.push(sellLines.length ? sellLines.join("\n") : reply.noSalesToday);
  if (entries.length >= 2) lines.push(reply.topSeller(capitalize(entries[0].displayName)));
  const totalRevenue = entries.reduce((sum, { revenue }) => sum + revenue, 0);
  lines.push(reply.reportRevenue(totalRevenue));

  const lowItems = store.getInventory(sender).filter((i) => i.quantity < config.lowStockThreshold);
  if (lowItems.length > 0) {
    lines.push("", reply.summaryReorderHeader);
    for (const i of lowItems) lines.push(reply.lowStockItem(capitalize(i.name), i.quantity, i.unit));
  }

  const udhaarTotal = store.getKhata(sender).reduce((sum, k) => sum + Math.max(0, k.balance), 0);
  if (udhaarTotal > 0) lines.push("", reply.summaryUdhaarDue(udhaarTotal));

  return lines.join("\n");
}

// ── Daily-summary scheduling (IST wall clock, timezone-independent) ──

function pad2(n: number): string { return String(n).padStart(2, "0"); }

/** IST date ("YYYY-MM-DD") and time ("HH:MM") for a given instant, any server TZ. */
function istParts(now: Date = new Date()): { date: string; hhmm: string } {
  const d = new Date(now.getTime() + 5.5 * 3600_000); // shift UTC → IST, then read UTC fields
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    hhmm: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

/** Parse "9pm", "9 pm", "9:30pm", "21:00", "9" → "HH:MM" (24h), or null. Bare 1–11 assumed PM (shop closing). */
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  const ap = m[3];
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 11) h += 12; // "9" → 9 PM
  return `${pad2(h)}:${pad2(min)}`;
}

/** "21:00" → "9:00 PM" for a friendly confirmation. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ap}`;
}

/** Sends each shop its daily summary once, when its set time has arrived. */
export async function runDueSummaries(now: Date = new Date()): Promise<void> {
  const { date, hhmm } = istParts(now);
  for (const shop of store.getAllShops()) {
    if (!shop.summaryTime || shop.lastSummaryDate === date || hhmm < shop.summaryTime) continue;
    store.markSummarySent(shop.phone, date); // mark first so an overlapping tick can't double-send
    const reply = getReply(shop.language || "english");
    const ownerName = (shop.ownerName || "Owner").split(" ")[0];
    await sendText(shop.phone, buildDailySummary(shop.phone, ownerName, reply));
  }
}
