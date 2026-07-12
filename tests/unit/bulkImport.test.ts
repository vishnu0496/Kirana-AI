import { test } from "node:test";
import assert from "node:assert";
import { parseInventoryCsv } from "../../src/bulkImport.ts";

test("parses a header-based CSV with all columns", () => {
  const csv = "item,quantity,unit,price\nLux Soap,50,pcs,32\nLays Tomato 20g,100,pcs,20\n";
  const { rows, skipped } = parseInventoryCsv(csv);
  assert.strictEqual(skipped, 0);
  assert.deepStrictEqual(rows, [
    { item: "Lux Soap", quantity: 50, unit: "pcs", price: 32 },
    { item: "Lays Tomato 20g", quantity: 100, unit: "pcs", price: 20 },
  ]);
});

test("header columns can be reordered and are case-insensitive", () => {
  const csv = "PRICE,Item,Quantity\n45,Sandal Soap,12\n";
  const { rows } = parseInventoryCsv(csv);
  assert.deepStrictEqual(rows, [{ item: "Sandal Soap", quantity: 12, unit: "", price: 45 }]);
});

test("unit and price are optional", () => {
  const csv = "item,quantity\nParle G,200\n";
  const { rows } = parseInventoryCsv(csv);
  assert.deepStrictEqual(rows, [{ item: "Parle G", quantity: 200, unit: "", price: undefined }]);
});

test("falls back to positional item,quantity,unit,price with no header", () => {
  const csv = "Nice Soap,30,pcs,28\nMaggi,80,pcs,14\n";
  const { rows } = parseInventoryCsv(csv);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].item, "Nice Soap");
  assert.strictEqual(rows[0].quantity, 30);
});

test("skips malformed rows instead of throwing", () => {
  const csv = "item,quantity\nGood Item,10\n,5\nBad Qty,notanumber\nAnother Good,7\n";
  const { rows, skipped } = parseInventoryCsv(csv);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(skipped, 2);
});

test("handles quoted fields containing commas", () => {
  const csv = 'item,quantity\n"Lays, Tomato Flavor",25\n';
  const { rows } = parseInventoryCsv(csv);
  assert.strictEqual(rows[0].item, "Lays, Tomato Flavor");
});

test("empty input yields no rows", () => {
  assert.deepStrictEqual(parseInventoryCsv(""), { rows: [], skipped: 0 });
  assert.deepStrictEqual(parseInventoryCsv("   \n\n  "), { rows: [], skipped: 0 });
});
