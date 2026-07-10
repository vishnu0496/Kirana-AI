# Language Understanding in KiranaAI

Why exact phrase lists like `"neti report"` can never work for Telugu/Hindi,
and how the local machine-learning layer fixes it. Everything described here
runs offline — no external API is involved.

## 1. The linguistic problem

### 1.1 Telugu is agglutinative

A Telugu verb is a root plus a stack of suffixes that encode tense, person,
gender, and number ([Telugu grammar — Wikipedia](https://en.wikipedia.org/wiki/Telugu_grammar),
[Wiktionary: Telugu verbs](https://en.wiktionary.org/wiki/Appendix:Telugu_verbs)).
One root produces a whole paradigm — a phrase list would need every form:

| Form | Meaning | Structure |
|---|---|---|
| amm-ānu | I sold | root + 1st person sg |
| amm-indi | she/it sold | root + 3rd fem/neuter sg |
| amm-āḍu | he sold | root + 3rd masc sg |
| amm-āru | they / you (hon.) sold | root + 3rd plural |
| amm-āmu / amm-ām | we sold | root + 1st plural |

Same for *vacc-* (come → stock arrived): vachindi, vachāyi, vaccham…
Suffixation also triggers stem changes (ammu → ammānu with stem-final
u-deletion; aḍugu → aḍigānu with vowel ablaut), so even the *root* isn't
stable in writing ([languagesgulper: Telugu](https://www.languagesgulper.com/eng/Telugu.html)).

Time words multiply the same way: "today's report" can be *nēṭi* (genitive),
*nēḍu*, *ivāḷa*, *ī rōju* — romanized as neti, neeti, nedu, ivala, ivaala,
eeroju, ee roju, i roju… `"neti report"` in a keyword list catches exactly one
of dozens of legitimate forms. That was the bug.

### 1.2 Hindi participles agree in gender and number

Hindi past participles inflect for gender/number, so every event verb comes in
at least three forms: *bik gayā / bik gayī / bik gaye* (got sold),
*bechā / bechī / beche* (sold), *āyā / āyī / āye* (arrived). Question
phrasings vary further: *kitnā bikā*, *kitnī kamāī huī*, *āj kā hisāb*.

### 1.3 Romanization has no spelling standard

Shopkeepers type Latin-script Telugu/Hindi by ear. Published work on
code-mixed Indic NLP identifies this as the core difficulty: "Romanization and
non-standard usages lead to spelling variations... identifying Romanized text
remains an unsettled problem"
([Word Level Language Identification in English-Telugu Code Mixed Data](https://arxiv.org/pdf/2010.04482)).
Typical alternations: long vowels double or don't (a/aa, i/ee, u/oo), c/ch,
v/w, s/sh, k/kh, j/z, and consonant doubling (vachindi/vacchindi).

## 2. The machine-learning solution

### 2.1 Approach: character n-grams + Multinomial Naive Bayes

The literature on romanized/code-mixed Indic text converges on **character
n-gram features**, because variant spellings still share most of their
n-grams, and n-grams need no tokenizer, stemmer, or dictionary
([Gender prediction in English-Hindi code-mixed content](https://arxiv.org/pdf/1806.05600) —
char n-grams + Naive Bayes reached 87.3%;
[Sentiment analysis of transliterated Hindi/Marathi](https://aircconline.com/ijnlc/V7N2/7218ijnlc02.pdf)
compares NB/KNN/SVM on romanized documents). Naive Bayes specifically gives
us: training in seconds, a plain-JSON serializable model, and cheap
**incremental updates** for online learning.

Pipeline (`src/ml/`):

1. **`features.ts`** — lowercase, mask digits as `<num>`, then emit
   (a) raw word unigrams, (b) phonetically normalized unigrams
   (aa→a, ch→c, w→v, sh→s, kh→k, z→j, doubled letters collapsed — exactly the
   alternations from §1.3), and (c) char 3-/4-grams over the normalized,
   word-padded sentence.
2. **`naive-bayes.ts`** — multinomial NB with Laplace smoothing,
   length-normalized softmax confidence, JSON (de)serialization, `learn()` for
   online updates, and feature pruning to keep the model small.
3. **`corpus.ts`** — the "research as code": generation grammars encode the
   verb paradigms of §1.1–1.2 (26 Telugu sold-forms, 30 Hindi sold-forms, …),
   the time-word sets, item/unit lexicons, and a noise augmenter that applies
   the §1.3 spelling alternations. ~4,700 labelled samples are generated
   deterministically (seeded RNG) across 9 intents × 3 languages, including an
   explicit **"other"** class of chit-chat so the model can say "not a command".
4. **`train.ts`** (`npm run train`) — evaluates on a 10% held-out split
   (currently **99.2% intent / 98.9% language accuracy**), retrains on
   everything, writes `model.json` (~170 KB, committed to the repo).
5. **`index.ts`** — runtime loading + **online learning**: every
   high-precision rule hit (explicit verb, keyword match) is fed back via
   `learn()`, and the examples persist in `data/learned.json`, so the model
   keeps adapting to each shop's real phrasing. All local, capped, private.

### 2.2 How the parser uses it

Rules stay in charge of anything structured — quantities, units, prices,
item-name extraction — because regexes are deterministic and never
hallucinate. The classifier handles what rules can't:

| Situation | Decision |
|---|---|
| Line matches a keyword/verb rule | Rule wins; example fed to classifier (learning) |
| Digit-less line, no keyword hit | Classifier picks greeting/help/view_stock/report/low_stock if confidence ≥ 0.7, else "not understood" |
| Stock line with no explicit verb | Classifier breaks the add-vs-sold tie |
| Language detection | Classifier (fallback to regex heuristic below 0.6 confidence) |
| Classifier says "other" or is unsure | Bot honestly replies "didn't understand" — never guesses a stock action |

Number words are also handled generally: *das sabun aaya* → 10, *rendu kg
pappu* → 2, with ambiguous forms ("do" = English verb vs Hindi 2) converted
only when a unit or stock verb makes the reading safe.

### 2.3 Retraining

```bash
npm run train   # regenerates corpus, prints held-out accuracy, rewrites src/ml/model.json
```

To extend coverage (new intent, new dialect forms, more items), edit the
grammars in `src/ml/corpus.ts` and retrain. Generalization tests live in
`tests/unit/ml.test.ts` — every phrase there is absent from both the keyword
lists and the training templates on purpose.

## Sources

- [Telugu grammar — Wikipedia](https://en.wikipedia.org/wiki/Telugu_grammar)
- [Appendix: Telugu verbs — Wiktionary](https://en.wiktionary.org/wiki/Appendix:Telugu_verbs)
- [Telugu — languagesgulper](https://www.languagesgulper.com/eng/Telugu.html)
- [Word Level Language Identification in English-Telugu Code Mixed Data (arXiv:2010.04482)](https://arxiv.org/pdf/2010.04482)
- [Gender Prediction in English-Hindi Code-Mixed Social Media Content (arXiv:1806.05600)](https://arxiv.org/pdf/1806.05600)
- [Sentiment Analysis of Mixed Code for the Transliterated Hindi and Marathi Texts (IJNLC)](https://aircconline.com/ijnlc/V7N2/7218ijnlc02.pdf)
- [Sentiment Analysis in Code-Mixed Telugu-English Text with Unsupervised Data Normalization](https://www.academia.edu/78767092/Sentiment_Analysis_in_Code_Mixed_Telugu_English_Text_with_Unsupervised_Data_Normalization)
