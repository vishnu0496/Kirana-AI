import { test } from "node:test";
import assert from "node:assert";
import { smartParse, detectLanguage, cleanItemName, findFuzzyMatch } from "../../src/parser.ts";

test("greetings", () => {
  for (const msg of ["hi", "Hello", "namaste", "namaskaram", "good morning"]) {
    assert.strictEqual(smartParse(msg).action, "greeting", msg);
  }
});

test("help", () => {
  for (const msg of ["help", "menu", "commands"]) {
    assert.strictEqual(smartParse(msg).action, "help", msg);
  }
});

test("add: number-first with units", () => {
  const cases: [string, string, number, string][] = [
    ["add 10 kg sugar", "sugar", 10, "kg"],
    ["10 santoor aaya", "santoor", 10, ""],
    ["add 2.5 kg dal", "dal", 2.5, "kg"],
    ["5 pkt biscuit vachayi", "biscuit", 5, "pkt"],
    ["restocked 3 boxes chocolate", "chocolate", 3, "box"],
    ["got 12 bottles pepsi", "pepsi", 12, "bottle"],
  ];
  for (const [msg, item, qty, unit] of cases) {
    const r = smartParse(msg);
    assert.deepStrictEqual(r, { action: "add", item, quantity: qty, unit }, msg);
  }
});

test("sold: verbs in all three languages", () => {
  const cases: [string, string, number][] = [
    ["sold 5 chips", "chips", 5],
    ["5 chips becha", "chips", 5],
    ["3 soap ammamu", "soap", 3],
    ["2 kg sugar gaya", "sugar", 2],
  ];
  for (const [msg, item, qty] of cases) {
    const r = smartParse(msg);
    assert.strictEqual(r.action, "sold", msg);
    if (r.action === "sold") {
      assert.strictEqual(r.item, item, msg);
      assert.strictEqual(r.quantity, qty, msg);
    }
  }
});

test("number-last format", () => {
  const r = smartParse("santoor 10");
  assert.deepStrictEqual(r, { action: "add", item: "santoor", quantity: 10, unit: "" });
  const sold = smartParse("chips becha 5");
  assert.strictEqual(sold.action, "sold");
});

test("view stock", () => {
  for (const msg of ["stock", "inventory", "show inventory", "nilava", "stock dikao", "list"]) {
    assert.strictEqual(smartParse(msg).action, "view_stock", msg);
  }
});

test("report", () => {
  for (const msg of ["report", "today report", "aaj ka report", "neti report", "summary"]) {
    assert.strictEqual(smartParse(msg).action, "report", msg);
  }
});

test("low stock", () => {
  for (const msg of ["low stock", "kam stock", "takkuva stock", "reorder"]) {
    assert.strictEqual(smartParse(msg).action, "low_stock", msg);
  }
});

test("set price patterns", () => {
  const cases: [string, string, number][] = [
    ["sugar price 45", "sugar", 45],
    ["price of sugar is 45", "sugar", 45],
    ["rs 45 sugar", "sugar", 45],
    ["sugar rate 45", "sugar", 45],
    ["sugar ₹45", "sugar", 45],
  ];
  for (const [msg, item, price] of cases) {
    const r = smartParse(msg);
    assert.deepStrictEqual(r, { action: "set_price", item, price }, msg);
  }
});

test("bulk add", () => {
  const r = smartParse("added 10 soap 5 chips 2 kg sugar");
  assert.strictEqual(r.action, "bulk_add");
  if (r.action === "bulk_add") {
    assert.strictEqual(r.items.length, 3);
    assert.deepStrictEqual(r.items[2], { quantity: 2, unit: "kg", item: "sugar" });
  }
});

test("bulk sold", () => {
  const r = smartParse("sold 4 soap 2 chips");
  assert.strictEqual(r.action, "bulk_sold");
  if (r.action === "bulk_sold") assert.strictEqual(r.items.length, 2);
});

test("header lines are skipped", () => {
  assert.strictEqual(smartParse("sold:").action, "skip");
  assert.strictEqual(smartParse("add:").action, "skip");
});

test("unknown for genuinely unparseable input", () => {
  assert.strictEqual(smartParse("the weather is nice").action, "unknown");
  assert.strictEqual(smartParse("???").action, "unknown");
});

test("undo intent", () => {
  for (const msg of ["undo", "cancel", "galti ho gayi", "tappu ayindi", "wrong entry"]) {
    assert.strictEqual(smartParse(msg).action, "undo", msg);
  }
});

test("khata credit entries", () => {
  const cases: [string, string, number][] = [
    ["ramesh udhaar 50", "ramesh", 50],
    ["ramesh ko 100 udhaar", "ramesh", 100],
    ["udhaar suresh 30", "suresh", 30],
    ["ramesh appu 50", "ramesh", 50],
    ["sita ko rs 75 udhaar diya", "sita", 75],
  ];
  for (const [msg, customer, amount] of cases) {
    assert.deepStrictEqual(smartParse(msg), { action: "khata_credit", customer, amount }, msg);
  }
});

test("khata payments", () => {
  const cases: [string, string, number][] = [
    ["ramesh ne 20 diya", "ramesh", 20],
    ["ramesh paid 30", "ramesh", 30],
    ["suresh 50 jama", "suresh", 50],
    ["ramesh 40 katti", "ramesh", 40],
  ];
  for (const [msg, customer, amount] of cases) {
    assert.deepStrictEqual(smartParse(msg), { action: "khata_payment", customer, amount }, msg);
  }
});

test("view khata", () => {
  for (const msg of ["udhaar list", "khata", "appu list", "khata dikhao"]) {
    assert.strictEqual(smartParse(msg).action, "view_khata", msg);
  }
  assert.deepStrictEqual(smartParse("ramesh ka khata"), { action: "view_khata", customer: "ramesh" });
  assert.deepStrictEqual(smartParse("ramesh ka udhaar kitna hai"), { action: "view_khata", customer: "ramesh" });
});

test("set stock to absolute value", () => {
  assert.deepStrictEqual(smartParse("sugar stock 25 karo"), {
    action: "set_stock", item: "sugar", quantity: 25, unit: "",
  });
  assert.deepStrictEqual(smartParse("set soap to 12"), {
    action: "set_stock", item: "soap", quantity: 12, unit: "",
  });
});

test("remove item", () => {
  assert.deepStrictEqual(smartParse("remove sugar"), { action: "remove_item", item: "sugar" });
  assert.deepStrictEqual(smartParse("chips hatao"), { action: "remove_item", item: "chips" });
});

test("week and month reports", () => {
  for (const msg of ["week report", "hafte ka report", "vaaram report", "this week sales"]) {
    assert.strictEqual(smartParse(msg).action, "week_report", msg);
  }
  for (const msg of ["month report", "mahine ka report", "nela report", "this month sales"]) {
    assert.strictEqual(smartParse(msg).action, "month_report", msg);
  }
});

test("khata does not shadow normal stock lines", () => {
  assert.strictEqual(smartParse("sold 5 chips").action, "sold");
  assert.strictEqual(smartParse("add 10 kg sugar").action, "add");
  assert.strictEqual(smartParse("10 santoor aaya").action, "add");
});

test("detectLanguage", () => {
  assert.strictEqual(detectLanguage("namaskaram anna"), "telugu");
  assert.strictEqual(detectLanguage("bhai kya haal"), "hindi");
  assert.strictEqual(detectLanguage("hello there"), "english");
});

test("cleanItemName strips verbs and noise", () => {
  assert.strictEqual(cleanItemName("sugar aaya"), "sugar");
  assert.strictEqual(cleanItemName("sold chips"), "chips");
  assert.strictEqual(cleanItemName("soap vachayi"), "soap");
});

test("findFuzzyMatch", () => {
  assert.strictEqual(findFuzzyMatch("santoor", ["Santoor Soap", "Chips"]), "Santoor Soap");
  assert.strictEqual(findFuzzyMatch("Santoor Soap", ["santoor soap"]), "santoor soap");
  assert.strictEqual(findFuzzyMatch("pepsi", ["Chips", "Soap"]), null);
});
