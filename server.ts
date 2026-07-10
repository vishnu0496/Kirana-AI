import express from "express";
import crypto from "node:crypto";
import { config } from "./src/env";
import { handleIncomingMessage } from "./src/bot";
import { checkAndRegisterMessageId, flush } from "./src/store";

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as WebhookRequest).rawBody = buf;
    },
  })
);

interface WebhookRequest extends express.Request {
  rawBody?: Buffer;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Meta webhook verification handshake
app.get("/api/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

function verifySignature(req: WebhookRequest): boolean {
  if (!config.whatsappAppSecret) return true; // verification disabled (dev/test)
  if (!req.rawBody) return false;
  const sigHeader = req.headers["x-hub-signature-256"];
  if (typeof sigHeader !== "string" || !sigHeader.startsWith("sha256=")) return false;
  const expected = Buffer.from(sigHeader.slice("sha256=".length), "hex");
  const computed = crypto
    .createHmac("sha256", config.whatsappAppSecret)
    .update(req.rawBody)
    .digest();
  return expected.length === computed.length && crypto.timingSafeEqual(expected, computed);
}

interface IncomingMessage {
  sender: string;
  text: string;
  messageId: string;
  buttonId: string;
}

function extractMessage(body: any): IncomingMessage | null {
  if (body?.object === "whatsapp_business_account") {
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg?.type === "text") {
      return { sender: msg.from, text: msg.text?.body ?? "", messageId: msg.id ?? "", buttonId: "" };
    }
    if (msg?.type === "interactive" && msg.interactive?.type === "button_reply") {
      return {
        sender: msg.from,
        text: msg.interactive.button_reply?.title ?? "",
        messageId: msg.id ?? "",
        buttonId: msg.interactive.button_reply?.id ?? "",
      };
    }
    return null;
  }
  // Simple test payload shape: { text, from, id?, buttonId? }
  if (body?.text) {
    return {
      sender: body.from || "919999999999",
      text: body.text,
      messageId: body.id || body.messageId || "",
      buttonId: body.buttonId || "",
    };
  }
  return null;
}

app.post("/api/webhook/whatsapp", async (req: WebhookRequest, res) => {
  if (!verifySignature(req)) {
    console.warn("[WA SIGNATURE] Signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const incoming = extractMessage(req.body);
  if (!incoming || !incoming.text || !incoming.sender) return res.sendStatus(200);

  if (incoming.messageId && checkAndRegisterMessageId(incoming.messageId).duplicate) {
    console.log(`[DEDUPE] Duplicate message ${incoming.messageId}, skipping`);
    return res.sendStatus(200);
  }

  console.log(`[WA RECV] ${incoming.sender}: ${incoming.text} (ID: ${incoming.messageId || "none"})`);

  try {
    await handleIncomingMessage(incoming.sender, incoming.text, incoming.buttonId);
  } catch (err) {
    console.error("[HANDLER ERROR]", err instanceof Error ? err.stack : err);
  }
  res.status(200).json({ success: true });
});

// Malformed JSON should be a 400, not a crash.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && "status" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  next(err);
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Kirana AI server running on port ${config.port}`);
});

function shutdown(signal: string) {
  console.log(`[SERVER] ${signal} received, shutting down`);
  try {
    flush();
  } catch (err) {
    console.error("[SERVER] Failed to flush store:", err);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[SERVER] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[SERVER] Unhandled rejection:", reason);
});
