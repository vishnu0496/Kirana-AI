// Offline training script: generates the synthetic corpus, evaluates on a
// held-out split, then trains on everything and writes model.json.
//
//   npm run train
//
// The committed model.json is what the server loads at runtime — training
// never happens on the request path and needs no external service.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NaiveBayes } from "./naive-bayes.ts";
import { generateCorpus } from "./corpus.ts";
import type { Sample } from "./corpus.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function evaluate(
  name: string,
  train: { text: string; label: string }[],
  test: { text: string; label: string }[]
): number {
  const nb = new NaiveBayes();
  nb.train(train);

  const perClass: Record<string, { right: number; total: number }> = {};
  let right = 0;
  for (const s of test) {
    const pred = nb.predict(s.text);
    perClass[s.label] ??= { right: 0, total: 0 };
    perClass[s.label].total++;
    if (pred.label === s.label) {
      right++;
      perClass[s.label].right++;
    }
  }
  const acc = right / test.length;
  console.log(`\n[${name}] held-out accuracy: ${(acc * 100).toFixed(1)}% (${right}/${test.length})`);
  for (const [label, { right: r, total }] of Object.entries(perClass).sort()) {
    console.log(`  ${label.padEnd(12)} ${((r / total) * 100).toFixed(1)}% (${r}/${total})`);
  }
  return acc;
}

const corpus = generateCorpus(42);
console.log(`Corpus: ${corpus.length} samples`);

const splitAt = Math.floor(corpus.length * 0.9);
const trainSet = corpus.slice(0, splitAt);
const testSet = corpus.slice(splitAt);

const toIntent = (s: Sample) => ({ text: s.text, label: s.intent });
const toLang = (s: Sample) => ({ text: s.text, label: s.lang });

const intentAcc = evaluate("intent", trainSet.map(toIntent), testSet.map(toIntent));
const langAcc = evaluate("language", trainSet.map(toLang), testSet.map(toLang));

// Final models trained on the full corpus.
const intentModel = new NaiveBayes();
intentModel.train(corpus.map(toIntent));
intentModel.prune(3);

const langModel = new NaiveBayes();
langModel.train(corpus.map(toLang));
langModel.prune(3);

const out = {
  meta: {
    trainedAt: new Date().toISOString(),
    samples: corpus.length,
    heldOutIntentAccuracy: Number((intentAcc * 100).toFixed(1)),
    heldOutLanguageAccuracy: Number((langAcc * 100).toFixed(1)),
  },
  intent: intentModel.toJSON(),
  language: langModel.toJSON(),
};

const outPath = path.join(here, "model.json");
fs.writeFileSync(outPath, JSON.stringify(out));
const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`\nWrote ${outPath} (${sizeKb} KB)`);
