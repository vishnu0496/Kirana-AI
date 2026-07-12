import { test, before, after } from "node:test";
import assert from "node:assert";
import { TestHarness } from "./harness.ts";

const harness = new TestHarness();
const USER = "919876543212";

before(async () => {
  await harness.start();
  await harness.sendUserMessage(USER, "hello");
  await harness.sendUserMessage(USER, "Big Bazaar Kirana");
  await harness.sendUserMessage(USER, "Ramesh");
});

after(async () => {
  await harness.stop();
});

test("imports a CSV inventory file sent as a WhatsApp document", async () => {
  harness.mock.clear();
  harness.mock.setMediaContent(
    "media-csv-1",
    "item,quantity,unit,price\nLux Soap,50,pcs,32\nLays Tomato 20g,100,pcs,20\nSandal Soap,30,pcs,45\n"
  );

  const [reply] = await harness.sendDocumentMessage(USER, "media-csv-1");
  assert.match(reply, /Imported 3 items/);

  const [inv] = await harness.sendUserMessage(USER, "show inventory");
  assert.match(inv, /Lux Soap: 50/);
  assert.match(inv, /Sandal Soap: 30/);

  const [report] = await harness.sendUserMessage(USER, "sold 5 lux soap");
  assert.match(report, /Sold 5.*Lux Soap/i);
  assert.match(report, /Remaining: 45/);
});

test("reports skipped rows alongside successful ones", async () => {
  harness.mock.clear();
  harness.mock.setMediaContent(
    "media-csv-2",
    "item,quantity\nGood Item,10\n,5\nBad Qty,notanumber\n"
  );

  const [reply] = await harness.sendDocumentMessage(USER, "media-csv-2");
  assert.match(reply, /Imported 1 item/);
  assert.match(reply, /Skipped 2 rows/);
});

test("gives a helpful error when the file can't be downloaded", async () => {
  harness.mock.clear();
  const [reply] = await harness.sendDocumentMessage(USER, "media-does-not-exist");
  assert.match(reply, /Couldn't read that file/);
});
