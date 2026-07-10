import { extractFeatures } from "./features";

// Multinomial Naive Bayes over sparse text features.
//
// Chosen deliberately over anything fancier: it trains in seconds, the model
// serializes to plain JSON (no native deps, no runtime beyond Node), it
// supports incremental updates (online learning from live traffic), and the
// code-mixed-Indic literature shows char-n-gram NB is competitive for exactly
// this kind of romanized, spelling-unstable text.

export interface Prediction {
  label: string;
  confidence: number; // softmax over length-normalized class scores, 0..1
  scores: Record<string, number>;
}

interface ModelJSON {
  labels: string[];
  docCounts: number[];               // documents per label
  tokenTotals: number[];             // total feature count per label
  features: Record<string, number[]>; // feature -> count per label (sparse)
}

export class NaiveBayes {
  private labels: string[] = [];
  private docCounts: number[] = [];
  private tokenTotals: number[] = [];
  private features = new Map<string, number[]>();
  private alpha: number;

  constructor(alpha = 0.4) {
    this.alpha = alpha;
  }

  private labelIndex(label: string): number {
    let idx = this.labels.indexOf(label);
    if (idx === -1) {
      idx = this.labels.length;
      this.labels.push(label);
      this.docCounts.push(0);
      this.tokenTotals.push(0);
      for (const counts of this.features.values()) counts.push(0);
    }
    return idx;
  }

  /** Add one labelled example (works both for batch training and online learning). */
  learn(text: string, label: string): void {
    const idx = this.labelIndex(label);
    this.docCounts[idx]++;
    for (const f of extractFeatures(text)) {
      let counts = this.features.get(f);
      if (!counts) {
        counts = new Array(this.labels.length).fill(0);
        this.features.set(f, counts);
      }
      counts[idx]++;
      this.tokenTotals[idx]++;
    }
  }

  train(samples: { text: string; label: string }[]): void {
    for (const s of samples) this.learn(s.text, s.label);
  }

  predict(text: string): Prediction {
    const feats = extractFeatures(text);
    if (this.labels.length === 0 || feats.length === 0) {
      return { label: "other", confidence: 0, scores: {} };
    }

    const totalDocs = this.docCounts.reduce((a, b) => a + b, 0);
    const vocab = this.features.size;
    const logScores = this.labels.map((_, idx) => {
      let score = Math.log((this.docCounts[idx] + 1) / (totalDocs + this.labels.length));
      const denom = Math.log(this.tokenTotals[idx] + this.alpha * vocab);
      for (const f of feats) {
        const count = this.features.get(f)?.[idx] ?? 0;
        score += Math.log(count + this.alpha) - denom;
      }
      return score;
    });

    // Length-normalize before softmax so long messages don't saturate to 1.0
    // and confidences stay comparable across message lengths.
    const normalized = logScores.map((s) => s / Math.sqrt(feats.length));
    const max = Math.max(...normalized);
    const exps = normalized.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);

    let best = 0;
    for (let i = 1; i < this.labels.length; i++) {
      if (logScores[i] > logScores[best]) best = i;
    }

    const scores: Record<string, number> = {};
    this.labels.forEach((l, i) => (scores[l] = exps[i] / sum));
    return { label: this.labels[best], confidence: exps[best] / sum, scores };
  }

  /** Drop rare features to keep the serialized model small. */
  prune(minCount = 3): void {
    for (const [f, counts] of this.features) {
      const total = counts.reduce((a, b) => a + b, 0);
      if (total < minCount) {
        for (let i = 0; i < counts.length; i++) this.tokenTotals[i] -= counts[i];
        this.features.delete(f);
      }
    }
  }

  toJSON(): ModelJSON {
    return {
      labels: this.labels,
      docCounts: this.docCounts,
      tokenTotals: this.tokenTotals,
      features: Object.fromEntries(this.features),
    };
  }

  static fromJSON(json: ModelJSON, alpha = 0.4): NaiveBayes {
    const nb = new NaiveBayes(alpha);
    nb.labels = json.labels;
    nb.docCounts = json.docCounts;
    nb.tokenTotals = json.tokenTotals;
    nb.features = new Map(Object.entries(json.features));
    return nb;
  }
}
