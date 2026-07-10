import { config } from "./env";
import { smartParse, detectLanguage, capitalize, explicitAction, ParseResult } from "./parser";
import { getReply, Lang } from "./templates";
import { checkAccess } from "./billing";
import { sendText, sendButtons, Button } from "./whatsapp";
import * as store from "./store";

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

/** Handle one incoming WhatsApp message (text or button tap). */
export async function handleIncomingMessage(
  sender: string,
  messageText: string,
  buttonId: string = ""
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
      return;
    }
  }

  const profile = store.getUser(sender);
  if (!profile) {
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

  // Switch language when the user writes in a different one.
  let lang: Lang = profile.language || "english";
  const newLang = detectLanguage(messageText);
  if ((newLang === "telugu" || newLang === "hindi") && newLang !== lang) {
    lang = newLang;
    store.saveUser(sender, { language: lang });
  }

  const reply = getReply(lang);
  const ownerName = (profile.ownerName || "Owner").split(" ")[0];

  // Pending price queue: a bare number answers the current item's price.
  if (!buttonId && (await handlePriceQueue(sender, messageText, reply))) return;

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

  // Only a bare number (optionally with ₹/rs) is a price answer; anything
  // else falls through to normal parsing so the user isn't trapped.
  const priceMatch = messageText.trim().match(/^(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i);
  if (!priceMatch) {
    const parsed = smartParse(messageText);
    if (parsed.action === "unknown") {
      await sendText(sender, reply.askPriceAgain(capitalize(queue[0])));
      return true;
    }
    return false;
  }

  const price = parseFloat(priceMatch[1]);
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

function buildReport(sender: string, ownerName: string, reply: Reply): string {
  const txs = store.getTodayTransactions(sender);
  if (txs.length === 0) return reply.emptyReport;

  const sells = txs.filter((t) => t.action === "SELL");
  const sellMap: Record<string, { qty: number; revenue: number; displayName: string }> = {};
  for (const t of sells) {
    const key = t.item.toLowerCase().trim();
    if (!key) continue;
    // Prefer the current price so late price fixes correct the report.
    const currentPrice = store.getItemPrice(sender, key);
    const revenue = currentPrice != null ? currentPrice * t.quantity : t.revenue;
    sellMap[key] ??= { qty: 0, revenue: 0, displayName: t.item };
    sellMap[key].qty += t.quantity;
    sellMap[key].revenue += revenue;
  }

  const sellLines = Object.values(sellMap).map(({ qty, revenue, displayName }) =>
    `🛒 ${capitalize(displayName)}: ${qty}${revenue ? ` (₹${revenue})` : ""}`
  );
  const totalRevenue = Object.values(sellMap).reduce((sum, { revenue }) => sum + revenue, 0);

  return [
    reply.reportHeader(ownerName),
    "",
    sellLines.length ? sellLines.join("\n") : reply.noSalesToday,
    "",
    reply.reportRevenue(totalRevenue),
  ].join("\n");
}
