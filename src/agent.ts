// The agent: local predictive analytics over the shop's own transaction log.
// No LLM, no API — just honest statistics that turn data into actions and rupees.
// Every function takes an injectable `now` so behaviour is deterministic in tests.

import { config } from "./env.ts";
import * as store from "./store.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function normKey(name: string): string {
  return name.toLowerCase().trim();
}

/** SELL transactions within the trailing `days` window of `now`. */
function recentSells(sender: string, days: number, now: Date): store.Transaction[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return store
    .getLogs(sender)
    .filter((t) => t.action === "SELL" && new Date(t.timestamp).getTime() >= cutoff);
}

/** Average units/day an item has sold over the trailing window. */
export function itemVelocity(
  sender: string,
  itemKey: string,
  days: number = config.agentVelocityDays,
  now: Date = new Date()
): number {
  const key = normKey(itemKey);
  let sold = 0;
  for (const t of recentSells(sender, days, now)) {
    if (normKey(t.item) === key) sold += t.quantity;
  }
  return sold / days;
}

/** How many days of activity the shop has recorded (0 if none). */
export function daysOfHistory(sender: string, now: Date = new Date()): number {
  const logs = store.getLogs(sender);
  if (logs.length === 0) return 0;
  let earliest = Infinity;
  for (const t of logs) earliest = Math.min(earliest, new Date(t.timestamp).getTime());
  return (now.getTime() - earliest) / DAY_MS;
}

/** True once the shop has enough sales history for velocity insights to be meaningful. */
export function isWarmedUp(sender: string, now: Date = new Date()): boolean {
  return daysOfHistory(sender, now) >= config.agentWarmupDays;
}

export interface ReorderSuggestion {
  item: string;
  unit: string;
  perDay: number; // sales velocity
  left: number; // current stock
  daysCover: number; // how long the stock lasts
  orderQty: number; // suggested reorder quantity
}

/**
 * Items about to run out: velocity > 0 and stock lasts <= the reorder lead time.
 * Suggested order covers the next horizon of days. Ranked most-urgent first.
 */
export function reorderSuggestions(sender: string, now: Date = new Date()): ReorderSuggestion[] {
  const out: ReorderSuggestion[] = [];
  for (const item of store.getInventory(sender)) {
    const perDay = itemVelocity(sender, item.name, config.agentVelocityDays, now);
    if (perDay <= 0) continue;
    const daysCover = item.quantity / perDay;
    if (daysCover > config.agentLeadTimeDays) continue;
    const orderQty = Math.max(1, Math.ceil(perDay * config.agentReorderHorizonDays - item.quantity));
    out.push({ item: item.name, unit: item.unit, perDay, left: item.quantity, daysCover, orderQty });
  }
  return out.sort((a, b) => a.daysCover - b.daysCover);
}

export interface DeadStockItem {
  item: string;
  unit: string;
  qty: number;
  daysSinceSale: number;
  capital: number; // ₹ tied up (qty × price), 0 if price unknown
}

/**
 * Stock that's gone stale: in stock but no sale in `agentDeadStockDays`, and old
 * enough to judge (been in the shop that long). Ranked by capital tied up.
 */
export function deadStock(sender: string, now: Date = new Date()): DeadStockItem[] {
  const lastSell: Record<string, number> = {};
  const firstSeen: Record<string, number> = {};
  for (const t of store.getLogs(sender)) {
    const key = normKey(t.item);
    const ts = new Date(t.timestamp).getTime();
    firstSeen[key] = Math.min(firstSeen[key] ?? Infinity, ts);
    if (t.action === "SELL") lastSell[key] = Math.max(lastSell[key] ?? -Infinity, ts);
  }

  const deadMs = config.agentDeadStockDays * DAY_MS;
  const out: DeadStockItem[] = [];
  for (const item of store.getInventory(sender)) {
    if (item.quantity <= 0) continue;
    const key = normKey(item.name);
    const seen = firstSeen[key];
    if (seen === undefined || now.getTime() - seen < deadMs) continue; // too new to judge
    const ls = lastSell[key];
    const sinceMs = ls === undefined ? now.getTime() - seen : now.getTime() - ls;
    if (sinceMs < deadMs) continue;
    out.push({
      item: item.name,
      unit: item.unit,
      qty: item.quantity,
      daysSinceSale: Math.floor(sinceMs / DAY_MS),
      capital: item.quantity * (item.price ?? 0),
    });
  }
  return out.sort((a, b) => b.capital - a.capital);
}

export interface OverdueAccount {
  name: string;
  balance: number;
  daysOverdue: number;
}

/** Khata accounts owing money with no activity for `agentKhataOverdueDays`, biggest first. */
export function overdueKhata(sender: string, now: Date = new Date()): OverdueAccount[] {
  const overdueMs = config.agentKhataOverdueDays * DAY_MS;
  const out: OverdueAccount[] = [];
  for (const k of store.getKhata(sender)) {
    if (k.balance <= 0) continue;
    const sinceMs = now.getTime() - new Date(k.updatedAt).getTime();
    if (sinceMs < overdueMs) continue;
    out.push({ name: k.name, balance: k.balance, daysOverdue: Math.floor(sinceMs / DAY_MS) });
  }
  return out.sort((a, b) => b.balance - a.balance);
}
