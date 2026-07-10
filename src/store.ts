import fs from "node:fs";
import path from "node:path";
import { config } from "./env.ts";
import { findFuzzyMatch } from "./parser.ts";
import type { Lang } from "./templates.ts";

// ── Types ──────────────────────────────────────────────────

export interface InventoryItem {
  name: string;
  quantity: number;
  unit: string;
  price?: number;
  updatedAt: string;
}

export interface Transaction {
  action: "ADD" | "SELL";
  item: string;
  quantity: number;
  unit: string;
  price: number;
  revenue: number;
  timestamp: string; // ISO
}

export interface Billing {
  status: "trial" | "active" | "expired";
  trialStartedAt: string; // ISO
  activatedAt?: string;
}

export interface KhataAccount {
  name: string; // display name
  balance: number; // ₹ the customer owes the shop
  updatedAt: string;
}

export interface Shop {
  phone: string;
  shopName: string;
  ownerName: string;
  language: Lang;
  createdAt: string;
  updatedAt: string;
  billing: Billing;
  inventory: Record<string, InventoryItem>; // key: lowercased item name
  logs: Transaction[];
  pendingPriceFor: string[];
  khata?: Record<string, KhataAccount>; // key: lowercased customer name
}

export interface OnboardingState {
  step: "awaiting_shop_name" | "awaiting_owner_name";
  shopName?: string;
  language: Lang;
}

interface StoreData {
  shops: Record<string, Shop>;
  onboarding: Record<string, OnboardingState>;
  processedMessages: Record<string, number>; // messageId -> epoch ms
}

// ── Persistence ────────────────────────────────────────────
// Single-process JSON store: all reads/writes are synchronous and
// in-memory (no await between read and write), so message handling
// is race-free. Persistence is debounced and atomic (tmp + rename).

const STORE_FILE = path.join(config.dataDir, "store.json");
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_DAYS = 90;

function emptyData(): StoreData {
  return { shops: {}, onboarding: {}, processedMessages: {} };
}

function loadData(): StoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      return { ...emptyData(), ...parsed };
    }
  } catch (err) {
    // Corrupt store: keep the bad file aside instead of silently overwriting it.
    const backup = `${STORE_FILE}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(STORE_FILE, backup);
      console.error(`[STORE] Failed to parse ${STORE_FILE}; backed up to ${backup}`, err);
    } catch { /* ignore */ }
  }
  return emptyData();
}

fs.mkdirSync(config.dataDir, { recursive: true });
const data: StoreData = loadData();
console.log(`[STORE] Using local store at ${STORE_FILE} (${Object.keys(data.shops).length} shops)`);

let saveTimer: NodeJS.Timeout | null = null;

export function flush(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      flush();
    } catch (err) {
      console.error("[STORE] Failed to persist store:", err);
    }
  }, 100);
  saveTimer.unref();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Shops & onboarding ─────────────────────────────────────

export function getUser(phone: string): Shop | null {
  return data.shops[phone] ?? null;
}

export function saveUser(
  phone: string,
  patch: Partial<Pick<Shop, "shopName" | "ownerName" | "language">>
): Shop {
  const existing = data.shops[phone];
  const shop: Shop = existing ?? {
    phone,
    shopName: "",
    ownerName: "",
    language: "english",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    billing: { status: "trial", trialStartedAt: nowIso() },
    inventory: {},
    logs: [],
    pendingPriceFor: [],
  };
  Object.assign(shop, patch, { updatedAt: nowIso() });
  data.shops[phone] = shop;
  scheduleSave();
  return shop;
}

export function getOnboardingState(phone: string): OnboardingState | null {
  return data.onboarding[phone] ?? null;
}

export function setOnboardingState(phone: string, state: OnboardingState): void {
  data.onboarding[phone] = state;
  scheduleSave();
}

export function clearOnboardingState(phone: string): void {
  delete data.onboarding[phone];
  scheduleSave();
}

// ── Inventory ──────────────────────────────────────────────

export interface StockUpdateResult {
  ok: boolean; // false when selling an item that doesn't exist
  newQty: number;
  finalUnit: string;
  finalItem: string;
  isMerged: boolean;
  itemPrice: number;
}

export function updateStock(
  phone: string,
  item: string,
  quantity: number,
  action: "ADD" | "SELL",
  unit: string = ""
): StockUpdateResult {
  const shop = data.shops[phone];
  if (!shop) return { ok: false, newQty: 0, finalUnit: unit, finalItem: item, isMerged: false, itemPrice: 0 };

  const existingNames = Object.values(shop.inventory).map((i) => i.name);
  const fuzzyMatch = findFuzzyMatch(item, existingNames);
  let finalItem = item;
  let isMerged = false;
  if (fuzzyMatch && fuzzyMatch.toLowerCase() !== item.toLowerCase()) {
    finalItem = fuzzyMatch;
    isMerged = true;
  }

  const key = finalItem.toLowerCase().trim();
  const existing = shop.inventory[key];

  // Selling something we've never stocked shouldn't invent a zero-qty item.
  if (action === "SELL" && !existing) {
    return { ok: false, newQty: 0, finalUnit: unit, finalItem, isMerged, itemPrice: 0 };
  }

  const currentQty = existing?.quantity ?? 0;
  const finalUnit = unit || existing?.unit || "";
  const newQty = action === "ADD" ? currentQty + quantity : Math.max(0, currentQty - quantity);

  shop.inventory[key] = {
    name: existing?.name ?? finalItem,
    quantity: newQty,
    unit: finalUnit,
    ...(existing?.price !== undefined ? { price: existing.price } : {}),
    updatedAt: nowIso(),
  };
  shop.updatedAt = nowIso();
  scheduleSave();

  return { ok: true, newQty, finalUnit, finalItem, isMerged, itemPrice: existing?.price ?? 0 };
}

export function setItemPrice(phone: string, item: string, price: number): void {
  const shop = data.shops[phone];
  if (!shop) return;
  const key = item.toLowerCase().trim();
  const existing = shop.inventory[key];
  shop.inventory[key] = {
    name: existing?.name ?? item,
    quantity: existing?.quantity ?? 0,
    unit: existing?.unit ?? "",
    price,
    updatedAt: nowIso(),
  };
  scheduleSave();
}

export function getItemPrice(phone: string, item: string): number | null {
  const key = item.toLowerCase().trim();
  return data.shops[phone]?.inventory[key]?.price ?? null;
}

export function getInventory(phone: string): InventoryItem[] {
  const shop = data.shops[phone];
  return shop ? Object.values(shop.inventory) : [];
}

// ── Price queue ────────────────────────────────────────────

export function getPriceQueue(phone: string): string[] {
  return data.shops[phone]?.pendingPriceFor ?? [];
}

export function addToPriceQueue(phone: string, itemName: string): void {
  const shop = data.shops[phone];
  if (!shop) return;
  if (!shop.pendingPriceFor.includes(itemName)) {
    shop.pendingPriceFor.push(itemName);
    scheduleSave();
  }
}

export function shiftPriceQueue(phone: string): string | null {
  const shop = data.shops[phone];
  if (!shop || shop.pendingPriceFor.length === 0) return null;
  const shifted = shop.pendingPriceFor.shift()!;
  scheduleSave();
  return shifted;
}

// ── Transactions ───────────────────────────────────────────

export function logTransaction(
  phone: string,
  action: "ADD" | "SELL",
  item: string,
  quantity: number,
  unit: string = "",
  price: number = 0
): void {
  const shop = data.shops[phone];
  if (!shop) return;
  shop.logs.push({
    action,
    item,
    quantity,
    unit,
    price,
    revenue: action === "SELL" ? quantity * price : 0,
    timestamp: nowIso(),
  });
  // Keep logs bounded.
  const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000;
  if (shop.logs.length > 0 && new Date(shop.logs[0].timestamp).getTime() < cutoff) {
    shop.logs = shop.logs.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
  }
  scheduleSave();
}

export function getTodayTransactions(phone: string): Transaction[] {
  const shop = data.shops[phone];
  if (!shop) return [];
  const now = new Date();
  return shop.logs.filter((t) => {
    const d = new Date(t.timestamp);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });
}

export function getTransactionsSince(phone: string, days: number): Transaction[] {
  const shop = data.shops[phone];
  if (!shop) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return shop.logs.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
}

/** Reverse and remove the most recent stock transaction. */
export function undoLastTransaction(phone: string): Transaction | null {
  const shop = data.shops[phone];
  if (!shop || shop.logs.length === 0) return null;

  const tx = shop.logs.pop()!;
  const key = tx.item.toLowerCase().trim();
  const existing = shop.inventory[key];
  const currentQty = existing?.quantity ?? 0;
  const restoredQty =
    tx.action === "ADD" ? Math.max(0, currentQty - tx.quantity) : currentQty + tx.quantity;

  shop.inventory[key] = {
    name: existing?.name ?? tx.item,
    quantity: restoredQty,
    unit: existing?.unit ?? tx.unit,
    ...(existing?.price !== undefined ? { price: existing.price } : {}),
    updatedAt: nowIso(),
  };
  shop.updatedAt = nowIso();
  scheduleSave();
  return tx;
}

/** Set an item's quantity to an absolute value (stock correction). */
export function setQuantity(
  phone: string,
  item: string,
  quantity: number,
  unit: string = ""
): { finalItem: string; finalUnit: string } | null {
  const shop = data.shops[phone];
  if (!shop) return null;

  const fuzzyMatch = findFuzzyMatch(item, Object.values(shop.inventory).map((i) => i.name));
  const finalItem = fuzzyMatch ?? item;
  const key = finalItem.toLowerCase().trim();
  const existing = shop.inventory[key];
  const finalUnit = unit || existing?.unit || "";

  shop.inventory[key] = {
    name: existing?.name ?? finalItem,
    quantity,
    unit: finalUnit,
    ...(existing?.price !== undefined ? { price: existing.price } : {}),
    updatedAt: nowIso(),
  };
  shop.updatedAt = nowIso();
  scheduleSave();
  return { finalItem: shop.inventory[key].name, finalUnit };
}

/** Remove an item from inventory entirely. Returns its name, or null if not found. */
export function removeItem(phone: string, item: string): string | null {
  const shop = data.shops[phone];
  if (!shop) return null;
  const fuzzyMatch = findFuzzyMatch(item, Object.values(shop.inventory).map((i) => i.name));
  if (!fuzzyMatch) return null;
  const key = fuzzyMatch.toLowerCase().trim();
  const name = shop.inventory[key]?.name ?? fuzzyMatch;
  delete shop.inventory[key];
  shop.pendingPriceFor = shop.pendingPriceFor.filter((p) => p.toLowerCase() !== key);
  shop.updatedAt = nowIso();
  scheduleSave();
  return name;
}

// ── Khata (customer credit ledger) ─────────────────────────

/** Positive delta = customer took credit; negative = customer paid back. */
export function updateKhata(phone: string, customer: string, delta: number): KhataAccount | null {
  const shop = data.shops[phone];
  if (!shop) return null;
  const khata = (shop.khata ??= {});
  const key = customer.toLowerCase().trim();
  const existing = khata[key];
  const account: KhataAccount = {
    name: existing?.name ?? customer.trim(),
    balance: Math.round(((existing?.balance ?? 0) + delta) * 100) / 100,
    updatedAt: nowIso(),
  };
  if (account.balance <= 0) {
    // Settled (or overpaid — treat as settled at zero).
    account.balance = Math.max(0, account.balance);
  }
  khata[key] = account;
  shop.updatedAt = nowIso();
  scheduleSave();
  return account;
}

export function getKhata(phone: string): KhataAccount[] {
  const shop = data.shops[phone];
  if (!shop?.khata) return [];
  return Object.values(shop.khata)
    .filter((a) => a.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

export function getKhataAccount(phone: string, customer: string): KhataAccount | null {
  const shop = data.shops[phone];
  if (!shop?.khata) return null;
  const key = customer.toLowerCase().trim();
  if (shop.khata[key]) return shop.khata[key];
  // Fuzzy: prefix match on customer names
  const match = Object.keys(shop.khata).find((k) => k.startsWith(key) || key.startsWith(k));
  return match ? shop.khata[match] : null;
}

// ── Billing ────────────────────────────────────────────────

export function getBilling(phone: string): Billing | null {
  return data.shops[phone]?.billing ?? null;
}

export function setBillingStatus(phone: string, status: Billing["status"]): boolean {
  const shop = data.shops[phone];
  if (!shop) return false;
  shop.billing.status = status;
  if (status === "active") shop.billing.activatedAt = nowIso();
  scheduleSave();
  return true;
}

// ── Webhook idempotency ────────────────────────────────────

export function checkAndRegisterMessageId(messageId: string): { duplicate: boolean } {
  if (!messageId) return { duplicate: false };
  const now = Date.now();
  if (data.processedMessages[messageId]) return { duplicate: true };
  data.processedMessages[messageId] = now;
  // Prune expired receipts opportunistically.
  for (const [id, ts] of Object.entries(data.processedMessages)) {
    if (now - ts > RECEIPT_TTL_MS) delete data.processedMessages[id];
  }
  scheduleSave();
  return { duplicate: false };
}
