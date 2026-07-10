// Synthetic training corpus for the intent & language classifiers.
//
// Instead of hand-listing exact phrases ("neti report"), we encode the
// *grammar* of how shopkeepers actually write, and generate thousands of
// combinations from it:
//
// TELUGU — agglutinative: one verb root takes person/gender/number suffixes.
//   amm- (sell): amm-ānu (I), amm-indi (she/it), amm-āru (they/hon.),
//                amm-āmu/-am (we), amm-āḍu (he)
//   vacc-/vach- (come): vachindi, vachāyi (they-neuter), vaccham …
//   Time: nēḍu/nēṭi/ivāḷa/ī rōju (today), ninna (yesterday) — all romanized
//   dozens of ways (neti, neeti, ivala, ivaala, eeroju, ee roju …).
//
// HINDI — fusional with gender/number agreement on the participle:
//   bik gayā / bik gayī / bik gaye, bechā/bechī/beche, āyā/āyī/āye …
//   Time: āj (aaj/aj), kal (yesterday OR tomorrow), abhī.
//
// ROMANIZATION — no standard spelling: long vowels double or don't (a/aa),
//   c/ch, v/w, s/sh, kh/k, z/j alternate freely. The augmenter below injects
//   exactly these variations so the classifier learns to ignore them.

export interface Sample {
  text: string;
  intent: string;
  lang: "english" | "hindi" | "telugu";
}

// ── Deterministic RNG (reproducible training) ──────────────

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Slot lexicons ──────────────────────────────────────────

const ITEMS = [
  "sugar", "chini", "panchadara", "rice", "chawal", "biyyam", "dal", "pappu",
  "oil", "tel", "nune", "milk", "doodh", "palu", "soap", "sabun", "sabbu",
  "biscuit", "chips", "salt", "namak", "uppu", "atta", "maida", "chai patti",
  "onion", "pyaz", "ullipayalu", "aloo", "bangaladumpa", "ande", "gudlu",
  "parle g", "santoor", "colgate", "surf", "maggi", "kurkure", "pepsi",
];

const UNITS = ["kg", "g", "ltr", "ml", "pkt", "packet", "box", "bottle", "pcs", "dozen", "bag"];

// ── Verb paradigms ─────────────────────────────────────────

const TE_SOLD = [
  "ammanu", "ammaanu", "ammindi", "ammadu", "ammaru", "ammamu", "ammam",
  "amminaru", "ammesanu", "ammesam", "ammakam ayindi",
  "aipoyindi", "ayipoyindi", "aipoindi", "aipoyayi", "ayipoyayi",
  "poyindi", "poyayi", "teesukunnaru", "teeskellaru",
  "ichanu", "icchanu", "iccham", "istini", "khatam ayindi", "vellipoyindi",
];

const TE_ADD = [
  "vachindi", "vachhindi", "vaccindi", "vacindi", "vachayi", "vachhayi",
  "vaccayi", "vachinayi", "vacceyi", "techanu", "tecchanu", "teccham",
  "techam", "konnanu", "konnam", "konnaru", "pettanu", "pettam", "vesanu",
  "vesam", "add chesanu", "add chesam", "add cheyandi", "stock pettanu",
  "kottaga vachindi", "load dincham",
];

const HI_SOLD = [
  "becha", "bechi", "beche", "bech diya", "bech di", "bech diye",
  "bik gaya", "bik gayi", "bik gaye", "bika", "biki", "bike",
  "nikla", "nikli", "nikle", "nikal gaya", "nikal gayi", "nikal gaye",
  "khatam ho gaya", "khatam ho gayi", "khatam ho gaye", "khatam hua",
  "diya", "di", "diye", "de diya", "sale hua", "bikri hui",
  "customer le gaya", "customer ko diya", "kharch ho gaya",
];

const HI_ADD = [
  "aaya", "aayi", "aaye", "aa gaya", "aa gayi", "aa gaye", "a gaya",
  "mila", "mili", "mile", "laya", "layi", "laye", "le aaya", "le aya",
  "mangaya", "mangwaya", "kharida", "kharidi", "kharide",
  "rakha", "rakh diya", "daala", "daal diya", "bhara", "bhar diya",
  "add kiya", "stock kiya", "naya maal aaya", "maal aa gaya",
];

const EN_ADD = [
  "added", "add", "got", "received", "bought", "purchased", "came",
  "arrived", "restocked", "new stock", "brought", "stocked",
];

const EN_SOLD = [
  "sold", "sell", "gave", "delivered", "finished", "gone",
  "dispatched", "billed", "customer bought", "out",
];

// ── Time words ─────────────────────────────────────────────

const TE_TODAY = ["neti", "neeti", "nedu", "needu", "ivala", "ivaala", "ivvala", "eeroju", "ee roju", "e roju", "inniki", "i roju"];
const HI_TODAY = ["aaj", "aj", "aaj ka", "aaj ki", "aaj ke", "din ka", "din bhar ka", "abhi tak ka"];
const EN_TODAY = ["today", "todays", "today's", "for today", "daily"];

// ── Query templates ────────────────────────────────────────
// {T}=time {I}=item {N}=number {U}=unit

interface TemplateSet {
  lang: Sample["lang"];
  templates: string[];
}

const REPORT: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "{T} report", "show {T} report", "{T} sales", "{T} sales report",
      "how much did i earn {T}", "total sales {T}", "sales summary",
      "{T} earnings", "what did i sell {T}", "revenue {T}", "{T} summary",
      "show me {T} total", "how much profit {T}", "give me the {T} numbers",
      "whats my {T} collection", "business {T}", "how were sales {T}",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "{T} report", "{T} report dikhao", "{T} hisaab", "{T} hisab batao",
      "{T} hisab kitab dikhao", "{T} kitna bika", "{T} bikri", "{T} bikri batao",
      "{T} kitni kamai hui", "kamai batao", "{T} total batao", "{T} ka lekha jokha",
      "kitna becha {T}", "{T} sale ka total", "{T} kamai kitni hai",
      "kitne ka maal bika {T}", "{T} ki report bhejo", "{T} dhandha kaisa raha",
      "{T} collection kitna hua", "kitna kamaya {T}",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "{T} report", "{T} report chupinchu", "{T} report cheppu", "{T} ammakalu",
      "{T} ammakalu enta", "{T} enta ammam", "{T} enta ammanu", "{T} sales enta",
      "{T} enta amount vachindi", "mottam enta vachindi {T}", "{T} enta ammindi",
      "{T} hisab", "{T} total cheppu", "{T} collection enta", "{T} amount enta",
      "ammakalu enta unnayi {T}", "{T} entha business ayindi", "{T} lekka cheppu",
      "{T} enta vachindi", "report ivvu {T}",
    ],
  },
];

const VIEW_STOCK: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "show stock", "show inventory", "stock list", "what do i have",
      "check my stock", "list all items", "current stock", "whats in stock",
      "how much stock do i have", "show me everything", "full stock list",
      "inventory please", "what items do i have", "stock check",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "stock dikhao", "stok dikhao", "maal dikhao", "saman dikhao",
      "samaan dikhao", "kitna maal hai", "kya kya hai dukan me",
      "list dikhao", "sab saman batao", "stock batao", "mere paas kya hai",
      "kitna saman bacha hai", "poora stock dikhao", "pura maal batao",
      "dukan ka saman dikhao", "kya kya rakha hai",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "stock chupinchu", "stock chupandi", "nilva enta undi", "nilava chupinchu",
      "emi unnayi", "em unnayi shop lo", "sarukulu chupinchu", "list ivvu",
      "inventory chupinchu", "stock enta undi", "anni items chupinchu",
      "na daggara em undi", "nilva cheppu", "sarukula list cheppu",
      "shop lo enta stock undi", "emi migili unnayi",
    ],
  },
];

const LOW_STOCK: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "low stock", "what is running low", "which items are low", "reorder list",
      "what should i order", "items to reorder", "almost finished items",
      "whats about to finish", "show low items", "anything running out",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "kam stock", "kya khatam hone wala hai", "kaunsa maal kam hai",
      "kya order karna hai", "kam maal dikhao", "khatam hone wala saman",
      "kaun sa saman kam bacha hai", "kya kya khatam ho raha hai",
      "kam wale items batao", "kaunsa saman mangana hai",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "takkuva stock", "emi aipotunnayi", "takkuva unna items",
      "order cheyalsinavi", "em order cheyali", "aipoye items chupinchu",
      "takkuva nilva unnavi enti", "em aipoyayi", "emi takkuva unnayi",
      "order pettalsina items cheppu",
    ],
  },
];

const GREETING: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "hi", "hello", "hey", "good morning", "good evening", "gm", "hai",
      "hello bot", "hey there", "hi kirana", "yo", "hello ji",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "namaste", "namaste bhai", "ram ram", "kya haal hai", "kaise ho",
      "hello bhaiya", "salaam", "kya chal raha hai", "namaskar ji", "kaise hain aap",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "namaskaram", "namaskaram andi", "bagunnara", "ela unnaru", "hai anna",
      "em chestunnaru", "hello anna", "namaste andi", "bagunnava", "em sangathulu",
    ],
  },
];

const HELP: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "help", "menu", "commands", "what can you do", "how does this work",
      "show options", "guide me", "how to use this", "instructions please",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "madad", "madad karo", "help karo", "kaise use kare", "kya kar sakte ho",
      "mujhe sikhao", "option dikhao", "ye kaise chalta hai", "samjhao mujhe",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "sahayam", "sahayam kavali", "ela vadali", "nuvvu em cheyagalavu",
      "help cheyandi", "options chupinchu", "ela pani chestundi", "idi ela vadalo cheppu",
    ],
  },
];

const SET_PRICE: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "{I} price {N}", "set price of {I} to {N}", "{I} rate {N}",
      "price {I} {N}", "update {I} price {N}", "{I} costs {N} rupees",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "{I} ka daam {N}", "{I} ka rate {N}", "{I} ki kimat {N}",
      "{I} ka bhav {N} rakho", "daam set karo {I} {N}", "{I} ka dam {N} hai",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "{I} dhara {N}", "{I} rate {N} pettu", "{I} price {N} set cheyi",
      "{I} ki dhara {N}", "{I} dhara {N} rupayalu",
    ],
  },
];

const ADD_TEMPLATES: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "{V} {N} {U} {I}", "{V} {N} {I}", "{N} {U} {I} {V}", "{N} {I} {V}",
      "{I} {N} {U} {V}", "{V} {N} {U} of {I}",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "{N} {U} {I} {V}", "{N} {I} {V}", "{I} {N} {U} {V}",
      "{V} {N} {I}", "{N} {U} {I} {V} hai",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "{N} {U} {I} {V}", "{N} {I} {V}", "{I} {N} {U} {V}", "{V} {N} {I}",
    ],
  },
];

// "other": chit-chat and unrelated messages the bot must NOT act on.
const OTHER: TemplateSet[] = [
  {
    lang: "english",
    templates: [
      "what is the weather today", "the weather is nice", "india match score",
      "call me later", "happy birthday", "ok", "thanks", "thank you", "hmm",
      "good night", "ok bye", "see you tomorrow", "send me the photo",
      "meeting at office", "i will come tomorrow", "where are you",
      "did you eat", "nice one", "lol", "great",
    ],
  },
  {
    lang: "hindi",
    templates: [
      "kal movie dekhi", "khana kha liya kya", "acha theek hai", "kuch nahi",
      "haan", "nahi", "chalo bye", "train late hai", "main kal aunga",
      "barish ho rahi hai", "kahan ho", "phone karna baad me", "arre wah",
      "kya baat hai", "milte hain kal", "ghar ja raha hoon",
    ],
  },
  {
    lang: "telugu",
    templates: [
      "cinema bagundi", "sare", "sari andi", "em ledu", "avunu", "ledu",
      "nenu repu vastanu", "vana padutundi", "bhojanam ayinda", "ekkada unnav",
      "tarvata call chestanu", "manchidi", "chala bagundi", "repu kaluddam",
      "intiki veltunna",
    ],
  },
];

// ── Spelling-noise augmentation ────────────────────────────
// Simulates romanization variance so the model learns to ignore it.

const NOISE_RULES: [RegExp, string][] = [
  [/a/, "aa"], [/aa/, "a"], [/i/, "ee"], [/ee/, "i"], [/u/, "oo"], [/oo/, "u"],
  [/ch/, "c"], [/c(?!h)/, "ch"], [/v/, "w"], [/w/, "v"], [/sh/, "s"],
  [/kh/, "k"], [/z/, "j"], [/(.)\1/, "$1"],
];

function addNoise(text: string, rand: () => number): string {
  let out = text;
  const nMutations = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < nMutations; i++) {
    const [re, repl] = NOISE_RULES[Math.floor(rand() * NOISE_RULES.length)];
    // Apply at a random matching position by splitting into words.
    const words = out.split(" ");
    const idx = Math.floor(rand() * words.length);
    words[idx] = words[idx].replace(re, repl);
    out = words.join(" ");
  }
  return out;
}

// ── Generation ─────────────────────────────────────────────

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function fill(template: string, lang: Sample["lang"], verbs: string[] | null, rand: () => number): string {
  const today = lang === "telugu" ? TE_TODAY : lang === "hindi" ? HI_TODAY : EN_TODAY;
  return template
    .replace("{T}", pick(today, rand))
    .replace("{I}", pick(ITEMS, rand))
    .replace("{N}", String(1 + Math.floor(rand() * 50))) // becomes <num> in features
    .replace("{U}", pick(UNITS, rand))
    .replace("{V}", verbs ? pick(verbs, rand) : "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateSet(
  sets: TemplateSet[],
  intent: string,
  perTemplate: number,
  rand: () => number,
  verbsByLang?: Record<Sample["lang"], string[]>
): Sample[] {
  const samples: Sample[] = [];
  for (const { lang, templates } of sets) {
    for (const template of templates) {
      for (let i = 0; i < perTemplate; i++) {
        const verbs = verbsByLang ? verbsByLang[lang] : null;
        const base = fill(template, lang, verbs, rand);
        samples.push({ text: base, intent, lang });
        // one noisy variant per clean sample
        samples.push({ text: addNoise(base, rand), intent, lang });
      }
    }
  }
  return samples;
}

export function generateCorpus(seed = 42): Sample[] {
  const rand = mulberry32(seed);
  const samples: Sample[] = [
    ...generateSet(REPORT, "report", 8, rand),
    ...generateSet(VIEW_STOCK, "view_stock", 8, rand),
    ...generateSet(LOW_STOCK, "low_stock", 8, rand),
    ...generateSet(GREETING, "greeting", 8, rand),
    ...generateSet(HELP, "help", 8, rand),
    ...generateSet(SET_PRICE, "set_price", 8, rand),
    ...generateSet(OTHER, "other", 8, rand),
    ...generateSet(ADD_TEMPLATES, "add", 10, rand, {
      english: EN_ADD,
      hindi: HI_ADD,
      telugu: TE_ADD,
    }),
    ...generateSet(ADD_TEMPLATES, "sold", 10, rand, {
      english: EN_SOLD,
      hindi: HI_SOLD,
      telugu: TE_SOLD,
    }),
  ];

  // Shuffle deterministically
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }
  return samples;
}
