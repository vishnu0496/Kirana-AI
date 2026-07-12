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
