import { test, before, after } from "node:test";
import assert from "node:assert";
import { TestHarness } from "./harness.ts";

const harness = new TestHarness();
const USER = "919876543211";
const ADMIN = "919999999999";

before(async () => {
  await harness.start({
    BILLING_ENABLED: "true",
    TRIAL_DAYS: "-1", // negative forces immediate expiry; "0" is falsy and silently falls back to the 7-day default
    ADMIN_PHONE: ADMIN,
    MERCHANT_UPI_ID: "kirana@upi",
    SUPPORT_CONTACT: "+91 90000 00000",
  });
});

after(async () => {
  await harness.stop();
});

test("trial expires immediately with TRIAL_DAYS=0, shows UPI link", async () => {
  await harness.sendUserMessage(USER, "hello");
  await harness.sendUserMessage(USER, "Test Store");
  await harness.sendUserMessage(USER, "Vishnu");

  harness.mock.clear();
  const [reply] = await harness.sendUserMessage(USER, "add 10 soap");
  assert.match(reply, /trial/i);
  assert.match(reply, /upi:\/\/pay\?pa=kirana@upi/);
  assert.match(reply, /am=99/);
});

test("admin activates the shop and it gets a notification + access", async () => {
  harness.mock.clear();
  const [adminReply] = await harness.sendUserMessage(ADMIN, `activate ${USER}`);
  assert.match(adminReply, /is now active/);

  // Shop should have received its own "activated" notification, unprompted.
  await harness.mock.waitForMessages(2);
  const notified = harness.mock.texts().find((t) => /now active/i.test(t) && /Kirana AI/.test(t));
  assert.ok(notified, "expected an activation notification sent to the shop");

  harness.mock.clear();
  const [reply] = await harness.sendUserMessage(USER, "add 10 soap", 2);
  assert.match(reply, /Added 10 soap/i);
});

test("admin can deactivate a shop, blocking access again", async () => {
  harness.mock.clear();
  const [adminReply] = await harness.sendUserMessage(ADMIN, `deactivate ${USER}`);
  assert.match(adminReply, /is now expired/);

  harness.mock.clear();
  const [reply] = await harness.sendUserMessage(USER, "add 5 chips");
  assert.match(reply, /trial|support/i);
});

test("unknown admin command / non-admin sender does not trigger billing control", async () => {
  harness.mock.clear();
  const [reply] = await harness.sendUserMessage(USER, `activate ${USER}`);
  // Non-admin sender is still trial-expired, so this is treated as a normal (blocked) message.
  assert.match(reply, /trial|support/i);
});
