import { spawn, ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const APP_SECRET = "test_whatsapp_secret";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "string" ? 0 : address?.port;
      srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

/** Captures every message the app tries to send through the WhatsApp Cloud API. */
export class MockWhatsAppServer {
  private server: http.Server;
  public captured: { url: string; body: any }[] = [];
  public port = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method === "POST" && req.url?.match(/\/v\d+\.\d+\/[^/]+\/messages/)) {
          try {
            this.captured.push({ url: req.url, body: JSON.parse(body) });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ messages: [{ id: `wamid.${Date.now()}` }] }));
            return;
          } catch {
            res.writeHead(400);
            res.end();
            return;
          }
        }
        res.writeHead(404);
        res.end();
      });
    });
  }

  start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server.address();
        this.port = typeof address === "string" ? 0 : address?.port || 0;
        resolve(this.port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  clear() {
    this.captured = [];
  }

  /** Wait until at least `count` messages have been captured. */
  async waitForMessages(count: number, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (this.captured.length < count) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Timed out waiting for ${count} WhatsApp messages (got ${this.captured.length}): ` +
            JSON.stringify(this.captured.map((c) => c.body?.type))
        );
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** Text content of every captured message (text bodies + interactive bodies). */
  texts(): string[] {
    return this.captured.map((c) =>
      c.body?.type === "interactive" ? c.body.interactive?.body?.text ?? "" : c.body?.text?.body ?? ""
    );
  }
}

export class TestHarness {
  public mock = new MockWhatsAppServer();
  public serverPort = 0;
  public dataDir = "";
  private serverProcess: ChildProcess | null = null;

  async start(extraEnv: Record<string, string> = {}) {
    const mockPort = await this.mock.start();
    this.serverPort = await getFreePort();
    this.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kirana-test-"));

    const env = {
      ...process.env,
      PORT: String(this.serverPort),
      DATA_DIR: this.dataDir,
      WHATSAPP_BASE_URL: `http://127.0.0.1:${mockPort}`,
      WHATSAPP_TOKEN: "test_token",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_VERIFY_TOKEN: "KIRANA_SECRET",
      WHATSAPP_APP_SECRET: APP_SECRET,
      NODE_ENV: "test",
      ...extraEnv,
    };

    this.serverProcess = spawn(process.execPath, ["server.ts"], { env });
    this.serverProcess.stdout?.on("data", (d) => process.stdout.write(`[SERVER] ${d}`));
    this.serverProcess.stderr?.on("data", (d) => process.stderr.write(`[SERVER-ERR] ${d}`));

    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.serverPort}/health`);
        if (res.ok) return;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server failed to start within timeout");
  }

  async stop() {
    this.serverProcess?.kill();
    await this.mock.stop();
    try {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    } catch { /* windows file locks */ }
  }

  sign(rawBody: string, secret = APP_SECRET): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  }

  /** POST a webhook payload; signs it with APP_SECRET unless signature === null. */
  async sendWebhook(payload: unknown, signature?: string | null): Promise<Response> {
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (signature !== null) headers["x-hub-signature-256"] = signature ?? this.sign(rawBody);
    return fetch(`http://127.0.0.1:${this.serverPort}/api/webhook/whatsapp`, {
      method: "POST",
      headers,
      body: rawBody,
    });
  }

  /** Send a plain user text message and wait for `expectReplies` bot replies. */
  async sendUserMessage(from: string, text: string, expectReplies = 1, id?: string): Promise<string[]> {
    const before = this.mock.captured.length;
    const res = await this.sendWebhook({ text, from, id: id ?? `wamid.test.${Date.now()}.${Math.random()}` });
    if (res.status !== 200) throw new Error(`Webhook returned ${res.status}`);
    if (expectReplies > 0) await this.mock.waitForMessages(before + expectReplies);
    return this.mock.texts().slice(before);
  }
}
