// Runtime ML: loads the pre-trained model and exposes intent / language
// classification plus online learning (the model keeps improving from the
// shop's own phrasing, persisted locally — never leaves the machine).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NaiveBayes, Prediction } from "./naive-bayes";
import { config } from "../env";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(here, "model.json");
const LEARNED_PATH = path.join(config.dataDir, "learned.json");
const MAX_LEARNED = 2000;

let intentModel: NaiveBayes;
let langModel: NaiveBayes;
let learned: { text: string; label: string }[] = [];
const learnedSeen = new Set<string>();

try {
  const raw = JSON.parse(fs.readFileSync(MODEL_PATH, "utf-8"));
  intentModel = NaiveBayes.fromJSON(raw.intent);
  langModel = NaiveBayes.fromJSON(raw.language);
  console.log(
    `[ML] Loaded model (${raw.meta?.samples ?? "?"} training samples, ` +
      `intent acc ${raw.meta?.heldOutIntentAccuracy ?? "?"}%)`
  );
} catch (err) {
  console.error("[ML] Failed to load model.json — run 'npm run train'. Falling back to empty model.", err);
  intentModel = new NaiveBayes();
  langModel = new NaiveBayes();
}

// Replay locally learned examples on top of the base model.
try {
  if (fs.existsSync(LEARNED_PATH)) {
    learned = JSON.parse(fs.readFileSync(LEARNED_PATH, "utf-8"));
    for (const s of learned) {
      learnedSeen.add(s.text);
      intentModel.learn(s.text, s.label);
    }
    if (learned.length > 0) console.log(`[ML] Replayed ${learned.length} locally learned examples`);
  }
} catch (err) {
  console.error("[ML] Failed to load learned examples:", err);
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleLearnedSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(LEARNED_PATH, JSON.stringify(learned));
    } catch (err) {
      console.error("[ML] Failed to persist learned examples:", err);
    }
  }, 500);
  saveTimer.unref();
}

export function classifyIntent(text: string): Prediction {
  return intentModel.predict(text);
}

export function classifyLanguage(text: string): Prediction {
  return langModel.predict(text);
}

/**
 * Online learning: when a high-precision rule identifies an intent, feed the
 * example back to the classifier so it adapts to this shop's phrasing.
 */
export function learnIntent(text: string, label: string): void {
  const key = text.toLowerCase().trim();
  if (!key || key.length > 200 || learnedSeen.has(key)) return;
  if (learned.length >= MAX_LEARNED) return;
  learnedSeen.add(key);
  learned.push({ text: key, label });
  intentModel.learn(key, label);
  scheduleLearnedSave();
}
