import { test, before, after } from "node:test";
import assert from "node:assert";
import { TestHarness } from "./harness.ts";

const harness = new TestHarness();
const USER = "919876543210";

before(async () => {
  await harness.start();
});

after(async () => {
  await harness.stop();
});

test("webhook verification handshake", async () => {
  const res = await fetch(
    `http://127.0.0.1:${harness.serverPort}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=KIRANA_SECRET&hub.challenge=abc123`
  );
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), "abc123");

  const bad = await fetch(
    `http://127.0.0.1:${harness.serverPort}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=abc123`
  );
  assert.strictEqual(bad.status, 403);
});

test("rejects missing or invalid signatures", async () => {
  const unsigned = await harness.sendWebhook({ text: "hi", from: USER }, null);
  assert.strictEqual(unsigned.status, 401);

  const badSig = await harness.sendWebhook({ text: "hi", from: USER }, "sha256=" + "0".repeat(64));
  assert.strictEqual(badSig.status, 401);
});

test("onboarding: shop name, owner name, welcome", async () => {
  harness.mock.clear();

  const [ask] = await harness.sendUserMessage(USER, "hello");
  assert.match(ask, /shop name/i);

  const [registered] = await harness.sendUserMessage(USER, "Sri Lakshmi Stores");
  assert.match(registered, /Sri Lakshmi Stores registered/);

  const [welcome] = await harness.sendUserMessage(USER, "Vishnu");
  assert.match(welcome, /Welcome Vishnu/);
});

test("add stock, price queue, sell, inventory, report", async () => {
  harness.mock.clear();

  // Add: expect confirmation + price question
  const addReplies = await harness.sendUserMessage(USER, "add 10 soap", 2);
  assert.match(addReplies[0], /Added 10 soap/i);
  assert.match(addReplies[1], /selling price of Soap/i);

  // Answer the price question with a bare number
  const [priceConfirmed] = await harness.sendUserMessage(USER, "40");
  assert.match(priceConfirmed, /Soap price saved: ₹40/);

  // Sell
  const [soldReply] = await harness.sendUserMessage(USER, "sold 2 soap");
  assert.match(soldReply, /Sold 2 soap/i);
  assert.match(soldReply, /Remaining: 8/);

  // Inventory
  const [inv] = await harness.sendUserMessage(USER, "show inventory");
  assert.match(inv, /Soap: 8/);

  // Report shows revenue at current price (2 × ₹40)
  const [report] = await harness.sendUserMessage(USER, "today report");
  assert.match(report, /Soap: 2/);
  assert.match(report, /₹80/);
});

test("price answer accepts trailing units like '40/- per half litre'", async () => {
  // Dedicated user so state/language doesn't leak into later tests.
  const U = "919876543230";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Milk Store");
  await harness.sendUserMessage(U, "Ravi");

  const addReplies = await harness.sendUserMessage(U, "add 5 milk", 2);
  assert.match(addReplies[1], /selling price of Milk/i);

  // Shopkeeper answers naturally with units, not a bare number.
  const [confirmed] = await harness.sendUserMessage(U, "40/- per half litre");
  assert.match(confirmed, /Milk price saved: ₹40/);
});

test("a numeric price answer does not flip the shop's language", async () => {
  const U = "919876543231";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Telugu Store");
  await harness.sendUserMessage(U, "Kiran");

  // Put the shop into Telugu, then add an item to trigger a price question.
  await harness.sendUserMessage(U, "das sabbulu vachayi", 2);
  const [priceReply] = await harness.sendUserMessage(U, "27/- each");
  // Reply must stay Telugu (price save confirmation), not switch to Hindi/English.
  assert.match(priceReply, /save ayindi/);
});

test("a weak language guess does not flip an established language", async () => {
  const U = "919876543232";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Store");
  await harness.sendUserMessage(U, "Anil");
  // Establish Telugu (strong signal), then clear the pending price question.
  await harness.sendUserMessage(U, "das paalu vachayi", 2);
  await harness.sendUserMessage(U, "30");
  // A weak-signal English/number reply must NOT flip to Hindi.
  const [reply] = await harness.sendUserMessage(U, "40/- per half litre");
  assert.doesNotMatch(reply, /Samajh nahi aaya/); // Hindi "not understood"
  assert.match(reply, /artham kaledu/i); // stayed Telugu
});

test("day summary on demand, and setting a summary time", async () => {
  const U = "919876543233";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Corner Shop");
  await harness.sendUserMessage(U, "Meena");

  // Set a daily summary time.
  const [setReply] = await harness.sendUserMessage(U, "summary 9pm");
  assert.match(setReply, /9:00 PM/);
  assert.match(setReply, /Daily summary set/i);

  // On-demand summary reflects the day's activity.
  await harness.sendUserMessage(U, "add 3 soap", 2);
  await harness.sendUserMessage(U, "40");
  await harness.sendUserMessage(U, "sold 1 soap");
  const [summary] = await harness.sendUserMessage(U, "day summary");
  assert.match(summary, /day summary/i);
  assert.match(summary, /Reorder soon/i); // soap now at 2 (<5)
});

test("order list recommends reordering a fast-mover about to run out", async () => {
  const U = "919876543234";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Fast Shop");
  await harness.sendUserMessage(U, "Ravi");

  await harness.sendUserMessage(U, "add 30 soap", 2); // add + price question
  await harness.sendUserMessage(U, "10");
  await harness.sendUserMessage(U, "sold 25 soap"); // 5 left, sold 25 today → high velocity

  const [reply] = await harness.sendUserMessage(U, "order list");
  assert.match(reply, /Order before you run out/i);
  assert.match(reply, /Soap/);
  assert.match(reply, /order ~/);
});

test("dead stock command replies cleanly when nothing is stale", async () => {
  const U = "919876543235";
  harness.mock.clear();
  await harness.sendUserMessage(U, "hello");
  await harness.sendUserMessage(U, "Fresh Shop");
  await harness.sendUserMessage(U, "Sita");
  const [reply] = await harness.sendUserMessage(U, "dead stock");
  assert.match(reply, /No dead stock/i);
});

test("selling an unknown item does not create it", async () => {
  harness.mock.clear();
  const [replyText] = await harness.sendUserMessage(USER, "sold 5 unicorn dust");
  assert.match(replyText, /not in your stock/i);

  const [inv] = await harness.sendUserMessage(USER, "show inventory");
  assert.doesNotMatch(inv, /unicorn/i);
});

test("low stock warning after selling below threshold", async () => {
  harness.mock.clear();
  const [soldReply] = await harness.sendUserMessage(USER, "sold 6 soap");
  assert.match(soldReply, /Remaining: 2/);
  assert.match(soldReply, /Low stock/i);
});

test("duplicate message IDs are processed once", async () => {
  harness.mock.clear();
  const id = "wamid.dedupe.test.1";
  await harness.sendUserMessage(USER, "add 3 chips", 2, id);
  const before = harness.mock.captured.length;

  const res = await harness.sendWebhook({ text: "add 3 chips", from: USER, id });
  assert.strictEqual(res.status, 200);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(harness.mock.captured.length, before, "duplicate should send no replies");
});

test("multiline message with sold: header context", async () => {
  harness.mock.clear();
  await harness.sendUserMessage(USER, "add 10 parle g", 2);
  await harness.sendUserMessage(USER, "15"); // price answer
  const [replyText] = await harness.sendUserMessage(USER, "sold:\n2 parle g");
  assert.match(replyText, /Sold 2 parle g/i);
});

test("greeting sends interactive menu buttons", async () => {
  harness.mock.clear();
  await harness.sendUserMessage(USER, "hi");
  const captured = harness.mock.captured[0];
  assert.strictEqual(captured.body.type, "interactive");
  const buttons = captured.body.interactive.action.buttons;
  assert.strictEqual(buttons.length, 3);
});

test("button tap triggers report", async () => {
  harness.mock.clear();
  const before = harness.mock.captured.length;
  await harness.sendWebhook({ text: "💰 Today's Report", from: USER, buttonId: "menu_report", id: `wamid.btn.${Date.now()}` });
  await harness.mock.waitForMessages(before + 1);
  assert.match(harness.mock.texts()[0], /report/i);
});

test("khata: credit, payment, list, settle", async () => {
  harness.mock.clear();

  const [credit] = await harness.sendUserMessage(USER, "ramesh udhaar 50");
  assert.match(credit, /Ramesh/);
  assert.match(credit, /₹50/);

  const [credit2] = await harness.sendUserMessage(USER, "suresh ko 100 udhaar");
  assert.match(credit2, /Suresh/);

  const [payment] = await harness.sendUserMessage(USER, "ramesh ne 20 diya");
  assert.match(payment, /₹30/); // 50 - 20 remaining

  const [list] = await harness.sendUserMessage(USER, "udhaar list");
  assert.match(list, /Ramesh: ₹30/);
  assert.match(list, /Suresh: ₹100/);
  assert.match(list, /₹130/); // total

  const [settled] = await harness.sendUserMessage(USER, "ramesh paid 30");
  assert.match(settled, /✅|saaf|clear|settled/i);
});

test("undo reverses the last stock entry", async () => {
  harness.mock.clear();
  await harness.sendUserMessage(USER, "soap stock 10 karo");
  await harness.sendUserMessage(USER, "sold 4 soap");

  const [undone] = await harness.sendUserMessage(USER, "undo");
  assert.match(undone, /↩️/);

  const [inv] = await harness.sendUserMessage(USER, "show inventory");
  assert.match(inv, /Soap: 10/);
});

test("set stock and remove item", async () => {
  harness.mock.clear();

  const [setReply] = await harness.sendUserMessage(USER, "soap stock 25 karo");
  assert.match(setReply, /✏️/);
  assert.match(setReply, /25/);

  const [removed] = await harness.sendUserMessage(USER, "remove parle g");
  assert.match(removed, /🗑️/);

  const [inv] = await harness.sendUserMessage(USER, "show inventory");
  assert.match(inv, /Soap: 25/);
  assert.doesNotMatch(inv, /parle/i);
});

test("week report covers recent sales", async () => {
  harness.mock.clear();
  const [report] = await harness.sendUserMessage(USER, "week report");
  assert.match(report, /7/);
  assert.match(report, /Soap|soap/);
});

test("health endpoint", async () => {
  const res = await fetch(`http://127.0.0.1:${harness.serverPort}/health`);
  assert.strictEqual(res.status, 200);
  const body = (await res.json()) as { status: string };
  assert.strictEqual(body.status, "ok");
});
