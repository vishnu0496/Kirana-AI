// Feature extraction for romanized (Latin-script) Telugu / Hindi / English.
//
// Romanized Indic text has no canonical spelling ("dikhao"/"dikao"/"dhikhao",
// "neti"/"nēṭi"/"neeti"), so word identity alone is a weak signal. Character
// n-grams are the standard remedy in the code-mixed NLP literature: variant
// spellings still share most of their n-grams. We combine:
//   1. raw word unigrams
//   2. phonetically normalized word unigrams (aa→a, ch→c, w→v, …)
//   3. char 3- and 4-grams over the normalized, padded text

/** Collapse common romanization variants to one canonical form. */
export function phoneticNormalize(word: string): string {
  return word
    .replace(/(.)\1+/g, "$1") // doubled letters & long vowels: aa→a, ee→e, mm→m
    .replace(/ch/g, "c")
    .replace(/sh/g, "s")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/bh/g, "b")
    .replace(/gh/g, "g")
    .replace(/kh/g, "k")
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/q/g, "k");
}

/** Lowercase, strip punctuation, replace numbers with a <num> token. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, " <num> ")
    .replace(/[^\p{L}<>\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFeatures(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const features: string[] = [];
  const words = normalized.split(" ");

  for (const word of words) {
    if (word === "<num>") {
      features.push("W:<num>");
      continue;
    }
    features.push(`W:${word}`);
    const ph = phoneticNormalize(word);
    if (ph !== word) features.push(`P:${ph}`);
  }

  // Char n-grams over the phonetically normalized sentence, word-padded so
  // grams capture word boundaries ("_am", "mu_").
  const phSentence = words
    .filter((w) => w !== "<num>")
    .map((w) => `_${phoneticNormalize(w)}_`)
    .join("");
  for (const n of [3, 4]) {
    for (let i = 0; i + n <= phSentence.length; i++) {
      features.push(`C${n}:${phSentence.slice(i, i + n)}`);
    }
  }

  return features;
}
