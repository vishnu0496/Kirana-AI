// Multilingual (English / Telugu / Hindi transliteration) intent parser.
//
// Two layers, both fully local:
//  1. High-precision rules for structured lines (quantities, units, prices)
//     and unambiguous keywords — deterministic, never wrong on their turf.
//  2. A locally-trained Naive Bayes classifier (src/ml/) over char n-grams
//     for everything the rules can't pin down — it generalizes across the
//     unstable romanized spellings and rich verb morphology of Telugu/Hindi
//     ("neti/neeti/ivala/eeroju report", "amm-anu/-indi/-aru/-amu").
// Every confident rule hit is fed back to the classifier (online learning),
// so the model keeps adapting to each shop's phrasing.

import { classifyIntent, classifyLanguage, learnIntent } from "./ml/index.ts";

// Below this confidence the classifier's opinion is ignored.
const ML_CONFIDENCE = 0.7;

// ── Word lists ─────────────────────────────────────────────

const greetingWords = [
  // English
  "hi", "hello", "hey", "hii", "helo", "sup", "yo", "howdy", "wassup", "whatsup",
  "good morning", "good evening", "good afternoon", "gm", "ge", "ga",
  // Telugu
  "namaskaram", "namasthe", "namaskar", "ayya", "anna", "bava",
  "em chestunnaru", "bagunnara", "bagunnava", "em visheshalu", "enti",
  // Hindi
  "namaste", "namastey", "bhai", "yaar", "boss",
  "kya haal", "kaise ho", "kya chal raha", "sab theek", "kya baat",
];

const helpWords = ["help", "menu", "commands", "options", "sahayam", "madad", "sahayata"];

const addVerbs = [
  // English
  "add", "added", "adding", "restock", "restocked", "restocking",
  "received", "receive", "got", "get", "came", "come", "brought", "bring",
  "purchase", "purchased", "buying", "bought", "arrived", "arrive",
  "loaded", "load", "filled", "fill", "inward", "new stock", "new batch",
  // Telugu (Tenglish)
  "vachayi", "vachindi", "vachenu", "tesukuvachha", "tecchaanu",
  "pettandi", "veyyandi", "veyyi", "konugoolu", "konukonaamu", "konnaamu",
  "sarukulu vachayi", "vachhayi", "tecchaaru", "load chesaamu",
  // Hindi (Hinglish)
  "aaya", "aayi", "aaye", "mila", "mili", "mile", "laya", "layi", "laye",
  "mangaya", "mangayi", "purchase kiya", "kharida", "kharidi",
  "rakho", "rakha", "daalo", "daala", "bharo", "bhara",
  "stock karo", "stock kiya", "aaya maal", "maal aaya", "naya maal", "aa gaya",
];

const soldVerbs = [
  // English
  "sold", "sell", "selling", "gone", "went", "finished", "finish",
  "gave", "give", "dispatched", "dispatch",
  "issued", "issue", "billed", "delivered", "deliver",
  "customer took", "customer bought",
  // Telugu (Tenglish)
  "ammamu", "ammindi", "ammaru", "ammaanu", "ammadam", "ammakaalu",
  "ammina", "ammanauten", "ammutundi", "iyyandi", "ichhaamu", "icchaanu",
  "poyindi", "ayipoyindi", "ayipoyayi", "teesindi", "teesukunnaru",
  "vikkindi", "vikrayam",
  // Hindi (Hinglish)
  "becha", "bechi", "beche", "bika", "biki", "bike",
  "gaya", "gayi", "gaye", "nikla", "nikli", "nikle",
  "khatam", "khatam hua", "diya", "diye", "de diya",
  "nikal gaya", "bikri", "bikayi", "kharch hua",
  "customer ko diya", "sale hua", "sell kiya", "bech diya",
];

const inventoryWords = [
  // English
  "inventory", "show inventory", "stock list", "show stock",
  "show list", "check stock", "what do i have", "balance", "remaining",
  // Telugu (Tenglish)
  "inventory chupandi", "stock chupandi", "nilava cheppandi",
  "nilava", "emunnayi", "em undi", "chupandi", "sarukulu chupandi",
  "enni unnai", "list cheppu", "entha undi", "entha unnai",
  "stock entha", "entha stoku", "nilava undi",
  "stock chupinchu", "inventory ivvu", "stock enti",
  // Hindi (Hinglish)
  "inventory dikao", "stock dikao", "list dikao", "stock dikhao", "list dikhao",
  "kitna hai", "kitna bacha", "kya bacha",
  "maal dikao", "maal dikhao", "sab dikao", "stock batao",
  "poora stock", "kitna maal",
];

const reportWords = [
  // English
  "report", "today report", "daily report", "sales report",
  "summary", "today summary", "today sales", "today total",
  "earnings", "income today",
  // Telugu (Tenglish)
  "neti report", "neti summary", "neti ammakaalu", "neti sales", "neti total",
  "ee roju report", "ee roju sales", "mottam cheppu",
  // Hindi (Hinglish)
  "aaj ka report", "aaj ki report", "aaj ka summary",
  "aaj kitna bika", "aaj ki bikri", "aaj ka total",
  "din ka report", "sales batao", "kitna kamaya", "aaj ka hisaab",
];

// ── Result types ───────────────────────────────────────────

export type ParseResult =
  | { action: "skip" }
  | { action: "greeting" }
  | { action: "help" }
  | { action: "low_stock" }
  | { action: "view_stock" }
  | { action: "report" }
  | { action: "set_price"; item: string; price: number }
  | { action: "add" | "sold"; item: string; quantity: number; unit: string }
  | { action: "bulk_add" | "bulk_sold"; items: { item: string; quantity: number; unit: string }[] }
  | { action: "unknown" };

// ── Helpers ────────────────────────────────────────────────

const UNIT_PATTERN = "kg|kgs|kilo|kilos|g|gm|gms|gram|grams|l|ltr|litre|liter|ml|pkt|pkts|packet|packets|box|boxes|bottle|bottles|btl|pc|pcs|piece|pieces|dozen|bag|bags|roll|rolls";

const UNIT_ALIASES: Record<string, string> = {
  kgs: "kg", kilo: "kg", kilos: "kg",
  gm: "g", gms: "g", gram: "g", grams: "g",
  l: "ltr", litre: "ltr", liter: "ltr",
  pkts: "pkt", packet: "pkt", packets: "pkt",
  boxes: "box",
  bottles: "bottle", btl: "bottle",
  pc: "pcs", piece: "pcs", pieces: "pcs",
  bags: "bag",
  rolls: "roll",
};

function normalizeUnit(unit: string | undefined): string {
  if (!unit) return "";
  const u = unit.toLowerCase();
  return UNIT_ALIASES[u] ?? u;
}

const QTY = "\\d+(?:\\.\\d+)?";

function parseQty(raw: string): number {
  return parseFloat(raw);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const noiseWords = [
  "ninna", "neti", "ee roju", "aaj", "kal", "yesterday", "today",
  "the", "a", "an", "some", "few", "of",
  "stock chesamu", "add chesamu", "ayyayi", "hai", "hain", "undi", "unnayi",
];

function cleanItemName(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  for (const word of [...addVerbs, ...soldVerbs, ...noiseWords]) {
    const w = escapeRegExp(word);
    cleaned = cleaned.replace(new RegExp(`^${w}\\s+|\\s+${w}$|^${w}$`, "gi"), "").trim();
  }
  return cleaned;
}

function detectLanguage(message: string): "telugu" | "hindi" | "english" {
  const p = classifyLanguage(message);
  if (p.confidence >= 0.6 && (p.label === "telugu" || p.label === "hindi" || p.label === "english")) {
    return p.label;
  }
  // Fallback heuristic for low-confidence cases (very short messages).
  const msg = message.toLowerCase();
  if (/namaskaram|vachayi|anna|ayya|bagundi|cheppu|meeru|ledhu|undi|ela|swaagatam|namasthe/.test(msg)) {
    return "telugu";
  }
  if (/namaste|bhai|kya|nahi|acha|theek|shukriya|bolo|accha|swagat|dhanyavaad/.test(msg)) {
    return "hindi";
  }
  return "english";
}

// ── Number words ───────────────────────────────────────────
// "das sabun aaya" → "10 sabun aaya", "rendu kg pappu" → "2 kg pappu".
// Ambiguous forms ("do" = English verb, "char" = plausible English) are only
// converted when the line clearly talks about stock (unit follows, or an
// add/sold verb is present).

const NUMBER_WORDS: Record<string, number> = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20,
  // Hindi
  ek: 1, do: 2, teen: 3, chaar: 4, char: 4, paanch: 5, panch: 5, chhe: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, bees: 20,
  pachas: 50, sau: 100,
  // Telugu
  okati: 1, oka: 1, rendu: 2, moodu: 3, mudu: 3, nalugu: 4, aidu: 5,
  ayidu: 5, aaru: 6, edu: 7, enimidi: 8, tommidi: 9, padi: 10, iravai: 20,
  muppai: 30, yabhai: 50, vanda: 100,
};

const AMBIGUOUS_NUMBER_WORDS = new Set(["do", "teen", "char", "one", "oka", "edu", "aaru", "nau", "saat"]);

export function replaceNumberWords(message: string): string {
  const msg = message.toLowerCase();
  const stockContext = explicitAction(msg) !== null;
  return msg.replace(/\b([a-z]+)\b(\s+[a-z]+)?/g, (full, word: string, rest: string | undefined) => {
    const value = NUMBER_WORDS[word];
    if (value === undefined) return full;
    if (AMBIGUOUS_NUMBER_WORDS.has(word)) {
      const nextIsUnit = rest !== undefined && new RegExp(`^\\s+(?:${UNIT_PATTERN})$`, "i").test(rest);
      if (!nextIsUnit && !stockContext) return full;
    }
    return `${value}${rest ?? ""}`;
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function findFuzzyMatch(newItem: string, existingItems: string[]): string | null {
  const n = newItem.toLowerCase().trim();

  const exact = existingItems.find((e) => e.toLowerCase() === n);
  if (exact) return exact;

  // One contains the other (merge prefixes/suffixes: "santoor" ↔ "santoor soap")
  const contains = existingItems.find((e) => {
    const e2 = e.toLowerCase().trim();
    return e2.includes(n) || n.includes(e2);
  });
  if (contains) return contains;

  // First word matches
  const firstWord = n.split(" ")[0];
  if (firstWord.length >= 4) {
    const firstMatch = existingItems.find((e) => e.toLowerCase().startsWith(firstWord));
    if (firstMatch) return firstMatch;
  }

  return null;
}

function hasVerb(msg: string, verbs: string[]): boolean {
  return verbs.some((v) =>
    v.includes(" ") ? msg.includes(v) : new RegExp(`(?:^|\\s)${escapeRegExp(v)}(?:[\\s:,.!]|$)`).test(msg)
  );
}

/** Which action a line explicitly names via a verb, if any. */
export function explicitAction(message: string): "add" | "sold" | null {
  const msg = message.toLowerCase();
  if (hasVerb(msg, soldVerbs)) return "sold";
  if (hasVerb(msg, addVerbs)) return "add";
  return null;
}

// ── Main parser ────────────────────────────────────────────

/**
 * Decide add vs sold for a stock line. Explicit verbs win (and teach the
 * classifier); otherwise the classifier breaks the tie, defaulting to add.
 */
function resolveStockAction(msg: string): "add" | "sold" {
  const explicit = explicitAction(msg);
  if (explicit) {
    learnIntent(msg, explicit);
    return explicit;
  }
  const p = classifyIntent(msg);
  if (p.label === "sold" && p.confidence >= ML_CONFIDENCE) return "sold";
  return "add";
}

function smartParse(message: string): ParseResult {
  const msg = replaceNumberWords(message).trim();

  // 1. Header lines like "add:" / "sold:" set context for following lines.
  //    Bare "stock" is a view-stock query, so it only counts with a colon.
  if (/^(?:(?:add|sold|sell|restock|update):?|stock:)\s*$/.test(msg) && !/\d/.test(msg)) {
    return { action: "skip" };
  }

  // 2. Greeting / help — exact or prefix match only, so item names survive.
  if (helpWords.some((w) => msg === w)) return { action: "help" };
  if (greetingWords.some((w) => msg === w || msg.startsWith(w + " "))) {
    return { action: "greeting" };
  }

  // 3. Low stock
  if (/low\s*stock|takkuva\s*stock|kam\s*stock|reorder/.test(msg)) {
    learnIntent(msg, "low_stock");
    return { action: "low_stock" };
  }

  // 4. View stock — standalone keywords or known phrases (never lines with digits,
  //    those are stock updates like "10 stock aaya").
  if (!/\d/.test(msg)) {
    if (["stock", "list", "nilava", "inventory", "maal"].includes(msg) ||
        inventoryWords.some((w) => msg.includes(w))) {
      learnIntent(msg, "view_stock");
      return { action: "view_stock" };
    }
    // 5. Report
    if (reportWords.some((w) => msg.includes(w))) {
      learnIntent(msg, "report");
      return { action: "report" };
    }
  }

  // 6. Price update: "sugar price 45", "price of sugar is 45", "₹45 sugar"
  const pricePatterns: { re: RegExp; itemIdx: number; priceIdx: number }[] = [
    { re: /^(.+?)\s+(?:price|rate|dam|bhaav|dhara|cost)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i, itemIdx: 1, priceIdx: 2 },
    { re: /^(?:set\s+)?(?:price|rate|update price)\s+(?:of\s+)?(.+?)\s+(?:is\s+)?(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i, itemIdx: 1, priceIdx: 2 },
    { re: /^(?:rs\.?|₹)\s*(\d+(?:\.\d+)?)\s+(.+)$/i, itemIdx: 2, priceIdx: 1 },
    { re: /^(.+?)\s+(?:rs\.?|₹)\s*(\d+(?:\.\d+)?)$/i, itemIdx: 1, priceIdx: 2 },
  ];
  for (const { re, itemIdx, priceIdx } of pricePatterns) {
    const m = msg.match(re);
    if (m) {
      const item = cleanItemName(m[itemIdx]);
      const price = parseQty(m[priceIdx]);
      if (item && !isNaN(price)) return { action: "set_price", item, price };
    }
  }

  // 7. Bulk lines: "add 10 soap 5 chips 2kg sugar" (two or more qty+item pairs)
  const bulkRe = new RegExp(`(${QTY})\\s*(${UNIT_PATTERN})?\\s+([a-z][a-z\\s]*?)(?=\\s*\\d|$)`, "gi");
  const bulkMatches = [...msg.matchAll(bulkRe)];
  if (bulkMatches.length >= 2) {
    const items = bulkMatches
      .map((m) => ({ quantity: parseQty(m[1]), unit: normalizeUnit(m[2]), item: cleanItemName(m[3]) }))
      .filter((i) => i.item && i.quantity > 0);
    if (items.length >= 2) {
      if (hasVerb(msg, soldVerbs)) return { action: "bulk_sold", items };
      if (hasVerb(msg, addVerbs)) return { action: "bulk_add", items };
    }
  }

  // 8. Number-first: "add 10 kg sugar", "10 santoor aaya", "sold 5 chips"
  const numFirst = msg.match(new RegExp(`(${QTY})\\s*(${UNIT_PATTERN})?\\s+(.+)$`, "i"));
  if (numFirst) {
    const quantity = parseQty(numFirst[1]);
    const unit = normalizeUnit(numFirst[2]);
    const item = cleanItemName(numFirst[3]);
    if (item && quantity > 0) {
      return { action: resolveStockAction(msg), quantity, unit, item };
    }
  }

  // 9. Number-last: "santoor 10", "chips becha 5"
  const numLast = msg.match(new RegExp(`^([a-z][\\w\\s]+?)\\s+(${QTY})\\s*(${UNIT_PATTERN})?$`, "i"));
  if (numLast) {
    const item = cleanItemName(numLast[1]);
    const quantity = parseQty(numLast[2]);
    const unit = normalizeUnit(numLast[3]);
    if (item && quantity > 0) {
      return { action: resolveStockAction(msg), quantity, unit, item };
    }
  }

  // 10. ML fallback: the rules gave up, ask the classifier. Only query
  //     intents are safe to act on without extracted quantities/items.
  if (!/\d/.test(msg)) {
    const p = classifyIntent(msg);
    if (p.confidence >= ML_CONFIDENCE) {
      if (p.label === "greeting") return { action: "greeting" };
      if (p.label === "help") return { action: "help" };
      if (p.label === "view_stock") return { action: "view_stock" };
      if (p.label === "report") return { action: "report" };
      if (p.label === "low_stock") return { action: "low_stock" };
    }
  }

  return { action: "unknown" };
}

export {
  smartParse,
  detectLanguage,
  cleanItemName,
  capitalize,
  addVerbs,
  soldVerbs,
  greetingWords,
  inventoryWords,
  reportWords,
};
