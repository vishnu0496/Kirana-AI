// KiranaAI server — zero runtime dependencies: built on node:http, runs as
// plain TypeScript on Node 22.18+ (native type stripping). The only outbound
// traffic is to the WhatsApp Cloud API.

import http from "node:http";
import crypto from "node:crypto";
import { config } from "./src/env.ts";
import { handleIncomingMessage } from "./src/bot.ts";
import { checkAndRegisterMessageId, flush } from "./src/store.ts";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifySignature(rawBody: Buffer, sigHeader: string | string[] | undefined): boolean {
  if (!config.whatsappAppSecret) return true; // verification disabled (dev/test)
  if (typeof sigHeader !== "string" || !sigHeader.startsWith("sha256=")) return false;
  const expected = Buffer.from(sigHeader.slice("sha256=".length), "hex");
  const computed = crypto
    .createHmac("sha256", config.whatsappAppSecret)
    .update(rawBody)
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

async function handleWebhookPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let rawBody: Buffer;
  try {
    rawBody = await readBody(req);
  } catch {
    return sendJson(res, 413, { error: "Payload too large" });
  }

  if (!verifySignature(rawBody, req.headers["x-hub-signature-256"])) {
    console.warn("[WA SIGNATURE] Signature verification failed");
    return sendJson(res, 401, { error: "Invalid signature" });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON payload" });
  }

  const incoming = extractMessage(body);
  if (!incoming || !incoming.text || !incoming.sender) {
    res.writeHead(200);
    res.end();
    return;
  }

  if (incoming.messageId && checkAndRegisterMessageId(incoming.messageId).duplicate) {
    console.log(`[DEDUPE] Duplicate message ${incoming.messageId}, skipping`);
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`[WA RECV] ${incoming.sender}: ${incoming.text} (ID: ${incoming.messageId || "none"})`);

  try {
    await handleIncomingMessage(incoming.sender, incoming.text, incoming.buttonId);
  } catch (err) {
    console.error("[HANDLER ERROR]", err instanceof Error ? err.stack : err);
  }
  sendJson(res, 200, { success: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { status: "ok", uptime: process.uptime() });
    }

    // Meta webhook verification handshake
    if (req.method === "GET" && url.pathname === "/api/webhook/whatsapp") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === config.whatsappVerifyToken) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(challenge ?? "");
      }
      res.writeHead(403);
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/api/webhook/whatsapp") {
      return await handleWebhookPost(req, res);
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error("[SERVER ERROR]", err instanceof Error ? err.stack : err);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Kirana AI server running on port ${config.port}`);
});

function shutdown(signal: string): void {
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
