import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the store BEFORE importing modules that read config.dataDir.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kirana-agent-"));

const agent = await import("../../src/agent.ts");
const store = await import("../../src/store.ts");

const DAY = 24 * 60 * 60 * 1000;

test("itemVelocity averages recent sales over the window", () => {
  const phone = "919000001001";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.logTransaction(phone, "SELL", "soap", 14, "", 10); // 14 sold now → 1/day over 14d
  assert.strictEqual(agent.itemVelocity(phone, "soap", 14), 1);
  assert.strictEqual(agent.itemVelocity(phone, "unknown", 14), 0);
});

test("reorderSuggestions flags fast-movers about to run out, with an order qty", () => {
  const phone = "919000001002";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.updateStock(phone, "soap", 5, "ADD");   // 5 in stock
  store.logTransaction(phone, "SELL", "soap", 50, "", 10); // 50/14 ≈ 3.57/day → ~1.4 days cover
  store.updateStock(phone, "rice", 40, "ADD");  // plenty in stock
  store.logTransaction(phone, "SELL", "rice", 14, "", 30); // 1/day → 40 days cover, not urgent

  const s = agent.reorderSuggestions(phone);
  assert.strictEqual(s.length, 1, "only soap is urgent");
  assert.strictEqual(s[0].item, "soap");
  assert.ok(s[0].daysCover <= 3);
  assert.ok(s[0].orderQty >= 15); // ceil(3.57*7 - 5) ≈ 20
});

test("reorderSuggestions ignores items with no sales history", () => {
  const phone = "919000001003";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.updateStock(phone, "candles", 2, "ADD"); // low stock but never sold → not a reorder
  assert.strictEqual(agent.reorderSuggestions(phone).length, 0);
});

test("isWarmedUp reflects how much history exists", () => {
  const phone = "919000001004";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.logTransaction(phone, "SELL", "soap", 1, "", 10);
  // Right now: ~0 days of history → not warmed up.
  assert.strictEqual(agent.isWarmedUp(phone, new Date()), false);
  // Ten days after that first log → warmed up.
  assert.strictEqual(agent.isWarmedUp(phone, new Date(Date.now() + 10 * DAY)), true);
});

test("deadStock flags stale, unsold stock ranked by capital tied up", () => {
  const phone = "919000001005";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.updateStock(phone, "candles", 10, "ADD");
  store.setItemPrice(phone, "candles", 5); // ₹50 tied up
  store.logTransaction(phone, "ADD", "candles", 10, "", 5);
  store.updateStock(phone, "incense", 4, "ADD");
  store.setItemPrice(phone, "incense", 30); // ₹120 tied up
  store.logTransaction(phone, "ADD", "incense", 4, "", 30);

  // 30 days later, neither has sold → both dead, ranked by capital.
  const dead = agent.deadStock(phone, new Date(Date.now() + 30 * DAY));
  assert.strictEqual(dead.length, 2);
  assert.strictEqual(dead[0].item, "incense"); // ₹120 first
  assert.strictEqual(dead[0].capital, 120);
  assert.strictEqual(dead[1].capital, 50);
  assert.ok(dead[0].daysSinceSale >= 29);
});

test("deadStock does not flag freshly-added items (too new to judge)", () => {
  const phone = "919000001006";
  store.saveUser(phone, { shopName: "S", ownerName: "A", language: "english" });
  store.updateStock(phone, "milk", 5, "ADD");
  store.logTransaction(phone, "ADD", "milk", 5, "", 10);
  assert.strictEqual(agent.deadStock(phone, new Date()).length, 0);
});
