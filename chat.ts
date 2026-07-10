// Offline CLI chat mode — talk to the bot in your terminal with zero setup:
// no WhatsApp credentials, no webhook, no tunnel, no internet.
//
//   npm run chat
//
// Uses the exact same brain (parser + ML + store) as the WhatsApp server;
// outbound messages are intercepted and printed instead of sent.

import readline from "node:readline/promises";
import { setOutboundOverride } from "./src/whatsapp.ts";
import { handleIncomingMessage } from "./src/bot.ts";
import { flush } from "./src/store.ts";

const SENDER = (process.env.CHAT_PHONE || "919999900000").replace(/\D/g, "");

setOutboundOverride((payload) => {
  if (payload.type === "text") {
    const text = (payload as any).text?.body ?? "";
    console.log(`\n🤖 ${text.split("\n").join("\n   ")}\n`);
  } else if (payload.type === "interactive") {
    const interactive = (payload as any).interactive;
    const body = interactive?.body?.text ?? "";
    const buttons: { reply: { title: string } }[] = interactive?.action?.buttons ?? [];
    console.log(`\n🤖 ${body.split("\n").join("\n   ")}`);
    if (buttons.length) {
      console.log(`   [${buttons.map((b) => b.reply.title).join("] [")}]`);
    }
    console.log();
  }
});

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  Kirana AI — offline chat mode (no WhatsApp needed)  ║");
console.log("║  Try: hi · add 10 soap · sold 2 soap · today report  ║");
console.log("║  Works in English, Hindi, Telugu. Ctrl+C to exit.    ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function main(): Promise<void> {
  process.stdout.write("You: ");
  for await (const raw of rl) {
    const line = raw.trim();
    if (line === "/exit" || line === "/quit") break;
    if (line) await handleIncomingMessage(SENDER, line);
    process.stdout.write("You: ");
  }
  rl.close();
  flush();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
