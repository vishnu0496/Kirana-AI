// Voice-note transcription — fully local via faster-whisper (Python), no API/key/quota.
// The Node server downloads the WhatsApp audio, then shells out to transcribe.py.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadMediaBinary } from "./whatsapp.ts";

/**
 * Turn a spoken sentence into one command per line so the parser can handle each item.
 * "I sold 10 snacks, 2 ice creams and 4 kgs of rice" → "sold 10 snacks\nsold 2 ice creams\nsold 4 kgs rice".
 * Leaves text without a leading action verb untouched.
 */
export function spokenToCommands(text: string): string {
  const t = text.trim().replace(/[.]+$/, "").replace(/^i\s+/i, "");
  const clauses = t.split(/\s*,\s*|\s+and\s+/i).map((c) => c.trim()).filter(Boolean);
  const SOLD = /\b(sold|sell|selling)\b/i;
  const ADD = /\b(added|add|adding|bought|buy|purchased|got|received|stocked|came|arrived)\b/i;

  const out: string[] = [];
  let lastVerb: "sold" | "add" | null = null;
  for (let clause of clauses) {
    let verb: "sold" | "add" | null = null;
    if (SOLD.test(clause)) { verb = "sold"; clause = clause.replace(SOLD, ""); }
    else if (ADD.test(clause)) { verb = "add"; clause = clause.replace(ADD, ""); }
    clause = clause.replace(/\bof\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!clause) continue;
    const v: "sold" | "add" = verb || lastVerb || "add"; // a verb-less clause inherits the previous one
    lastVerb = v;
    out.push(`${v} ${clause}`);
  }
  return out.length ? out.join("\n") : text;
}

const LANG_CODE: Record<string, string> = { telugu: "te", hindi: "hi", english: "en" };

/** Download a WhatsApp voice note and transcribe it to text (English, so the parser understands). */
export async function transcribeVoice(mediaId: string, shopLang = ""): Promise<string | null> {
  const bytes = await downloadMediaBinary(mediaId);
  if (!bytes) return null;
  const tmp = path.join(os.tmpdir(), `kirana-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.ogg`);
  fs.writeFileSync(tmp, bytes);
  try {
    return await runPython(tmp, LANG_CODE[shopLang] || "");
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
  }
}

function runPython(audioFile: string, langHint: string): Promise<string | null> {
  return new Promise((resolve) => {
    const python = process.env.PYTHON || "python";
    const env: Record<string, string> = { ...process.env, PYTHONIOENCODING: "utf-8" };
    if (langHint) env.WHISPER_LANGUAGE = langHint; // bias the model to the shop's language
    const proc = spawn(python, ["transcribe.py", audioFile, "translate"], {
      cwd: process.cwd(),
      env,
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else {
        if (err) console.error("[VOICE] transcription failed:", err.slice(0, 300));
        resolve(null);
      }
    });
    proc.on("error", (e) => {
      console.error("[VOICE] could not start python:", e instanceof Error ? e.message : e);
      resolve(null);
    });
  });
}
