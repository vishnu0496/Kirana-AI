import { test } from "node:test";
import assert from "node:assert";
import { classifyIntent, classifyLanguage } from "../../src/ml/index.ts";
import { smartParse, detectLanguage, replaceNumberWords } from "../../src/parser.ts";
import { extractFeatures, phoneticNormalize } from "../../src/ml/features.ts";

// Every phrase here is deliberately absent from the keyword lists AND from
// the training templates — this is the generalization the word lists could
// never provide ("neti report" was hard-coded; "neti lekka enta anna" works
// because the model learned the morphology, not the phrase).

test("ML generalizes report intent across morphology and spelling", () => {
  const phrases = [
    "ivala ammakalu enta",
    "aaj ki kamayi batao",
    "eroju entha vachindi",
    "aj ka hisab do",
    "kitna kamaya aaj bhai",
    "neti lekka enta anna",
  ];
  for (const p of phrases) {
    assert.strictEqual(smartParse(p).action, "report", p);
  }
});

test("ML generalizes stock queries", () => {
  const phrases = [
    "stok dikhavo",
    "nilva entha undo chepu",
    "dukaan me kya kya bacha hai",
    "shop lo emi unayi",
  ];
  for (const p of phrases) {
    assert.strictEqual(smartParse(p).action, "view_stock", p);
  }
});

test("ML generalizes low-stock queries", () => {
  for (const p of ["kya khatam hone vala hai", "em aipotunayi anna"]) {
    assert.strictEqual(smartParse(p).action, "low_stock", p);
  }
});

test("chit-chat is rejected, not misclassified as a command", () => {
  const phrases = [
    "the weather is nice",
    "kal shaadi me jana hai",
    "nenu sinima ki veltunna",
    "ok thik hai",
  ];
  for (const p of phrases) {
    assert.strictEqual(smartParse(p).action, "unknown", p);
    const pred = classifyIntent(p);
    assert.strictEqual(pred.label, "other", p);
  }
});

test("language classifier beats the old regex heuristic", () => {
  assert.strictEqual(detectLanguage("meeru ela unnaru"), "telugu");
  assert.strictEqual(detectLanguage("bhai kal dukan pe aana"), "hindi");
  assert.strictEqual(detectLanguage("hello how are you"), "english");
  assert.strictEqual(classifyLanguage("eroju entha vachindi").label, "telugu");
  assert.strictEqual(classifyLanguage("kitna kamaya aaj").label, "hindi");
});

test("number words convert only in safe contexts", () => {
  assert.deepStrictEqual(smartParse("das sabun aaya"), {
    action: "add", quantity: 10, unit: "", item: "sabun",
  });
  assert.deepStrictEqual(smartParse("rendu kg pappu vachindi"), {
    action: "add", quantity: 2, unit: "kg", item: "pappu",
  });
  // "do" = 2 only with a unit or stock verb; "what can you do" must survive
  assert.strictEqual(smartParse("do kg chini becha").action, "sold");
  assert.strictEqual(smartParse("what can you do").action, "help");
  assert.strictEqual(replaceNumberWords("what can you do"), "what can you do");
});

test("phonetic normalization collapses romanization variants", () => {
  assert.strictEqual(phoneticNormalize("dikhao"), phoneticNormalize("dikao"));
  assert.strictEqual(phoneticNormalize("neti"), phoneticNormalize("neeti"));
  assert.strictEqual(phoneticNormalize("vachindi"), phoneticNormalize("vacchindi"));
  assert.strictEqual(phoneticNormalize("wala"), phoneticNormalize("vala"));
});

test("feature extraction masks numbers", () => {
  const f1 = extractFeatures("sold 5 chips");
  const f2 = extractFeatures("sold 500 chips");
  assert.deepStrictEqual(f1, f2);
});
