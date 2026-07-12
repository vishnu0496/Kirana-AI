import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the store to a temp dir BEFORE importing modules that read config.dataDir.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kirana-summary-"));

const bot = await import("../../src/bot.ts");
const store = await import("../../src/store.ts");
const wa = await import("../../src/whatsapp.ts");

test("parseTime handles am/pm, 24h, and bare hours", () => {
  assert.strictEqual(bot.parseTime("9pm"), "21:00");
  assert.strictEqual(bot.parseTime("9 pm"), "21:00");
  assert.strictEqual(bot.parseTime("9:30pm"), "21:30");
  assert.strictEqual(bot.parseTime("21:00"), "21:00");
  assert.strictEqual(bot.parseTime("9"), "21:00"); // bare hour → evening (PM)
  assert.strictEqual(bot.parseTime("7am"), "07:00");
  assert.strictEqual(bot.parseTime("12am"), "00:00");
  assert.strictEqual(bot.parseTime("noon"), null);
  assert.strictEqual(bot.parseTime("25"), null);
});

test("formatTime is human friendly", () => {
  assert.strictEqual(bot.formatTime("21:00"), "9:00 PM");
  assert.strictEqual(bot.formatTime("09:05"), "9:05 AM");
  assert.strictEqual(bot.formatTime("00:00"), "12:00 AM");
  assert.strictEqual(bot.formatTime("12:00"), "12:00 PM");
});

test("runDueSummaries sends once when the set time has arrived, not before", async () => {
  const phone = "919000000001";
  store.saveUser(phone, { shopName: "Shop", ownerName: "Ravi", language: "english" });
  store.updateStock(phone, "soap", 3, "ADD"); // below low-stock threshold (5)
  store.setItemPrice(phone, "soap", 10);
  store.logTransaction(phone, "SELL", "soap", 2, "", 10); // ₹20 revenue today
  store.setSummaryTime(phone, "21:00");

  const sent: { to: string; text: string }[] = [];
  wa.setOutboundOverride((p: any) => { sent.push({ to: p.to, text: p.text?.body ?? "" }); });

  // 15:00 UTC == 20:30 IST — before 21:00, must NOT send.
  await bot.runDueSummaries(new Date("2026-07-12T15:00:00Z"));
  assert.strictEqual(sent.length, 0, "should not send before the set time");

  // 16:00 UTC == 21:30 IST — after 21:00, sends the summary.
  await bot.runDueSummaries(new Date("2026-07-12T16:00:00Z"));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, phone);
  assert.match(sent[0].text, /day summary/i);
  assert.match(sent[0].text, /Reorder soon/i);   // soap qty 3 < 5
  assert.match(sent[0].text, /₹20/);              // revenue

  // Same day, later tick → no duplicate.
  await bot.runDueSummaries(new Date("2026-07-12T17:00:00Z"));
  assert.strictEqual(sent.length, 1, "must not send twice the same day");

  wa.setOutboundOverride(null);
});
