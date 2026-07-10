import { spawn, ChildProcess } from "child_process";
import net from "net";
import http from "http";
import axios from "axios";
import crypto from "crypto";
import admin from "firebase-admin";
import assert from "node:assert";

// Function to check if a port is open
async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    socket.setTimeout(200);
    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });
    socket.once("error", () => {
      cleanup();
      resolve(false);
    });
    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// Check if emulator is actually running
const emulatorHostEnv = process.env.FIRESTORE_EMULATOR_HOST;
const hostPort = emulatorHostEnv || "127.0.0.1:8080";
const [host, portStr] = hostPort.split(":");
const port = parseInt(portStr || "8080");

const useEmulator = await isPortOpen(host, port);

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = hostPort;
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "kirana-bot-test";
  process.env.FIREBASE_FIRESTORE_DATABASE_ID = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db-test";
  console.log(`[HARNESS] Emulator is running at ${hostPort}. Using emulator.`);
} else {
  // Clear any emulator host env variable to fall back to cloud database
  delete process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIREBASE_FIRESTORE_DATABASE_ID = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db";
  console.log(`[HARNESS] Emulator is NOT running at ${hostPort}. Using cloud database: ${process.env.FIREBASE_FIRESTORE_DATABASE_ID}.`);
}

// Now import db
import { db } from "../../src/database.js";

// Helper to find a free port
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "string" ? 0 : address?.port;
      srv.close(() => {
        if (port) resolve(port);
        else reject(new Error("Failed to get free port"));
      });
    });
  });
}

// Mock WhatsApp HTTP Server
export class MockWhatsAppServer {
  private server: http.Server;
  public capturedRequests: any[] = [];
  public port: number = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
      });
      req.on("end", () => {
        const isMessagesEndpoint = req.url?.match(/\/v20\.0\/[^/]+\/messages/);
        if (req.method === "POST" && isMessagesEndpoint) {
          try {
            const parsedBody = JSON.parse(body);
            this.capturedRequests.push({
              headers: req.headers,
              body: parsedBody,
              url: req.url
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              messaging_product: "whatsapp",
              contacts: [{ input: parsedBody.to || "", wa_id: parsedBody.to || "" }],
              messages: [{ id: `wamid.msg_${Date.now()}` }]
            }));
            return;
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
        }
        res.writeHead(404);
        res.end();
      });
    });
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server.address();
        this.port = typeof address === "string" ? 0 : address?.port || 0;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  clear() {
    this.capturedRequests = [];
  }
}

// Test Harness Class
export class TestHarness {
  public serverProcess: ChildProcess | null = null;
  public mockWhatsAppServer: MockWhatsAppServer;
  public serverPort: number = 0;
  public mockPort: number = 0;

  constructor() {
    this.mockWhatsAppServer = new MockWhatsAppServer();
  }

  async start() {
    // 1. Start mock WhatsApp server
    this.mockPort = await this.mockWhatsAppServer.start();

    // 2. Find free port for Express server
    this.serverPort = await getFreePort();

    // 3. Spawn server.ts
    const env = {
      ...process.env,
      PORT: String(this.serverPort),
      WHATSAPP_BASE_URL: `http://127.0.0.1:${this.mockPort}`,
      WHATSAPP_APP_SECRET: "test_whatsapp_secret",
      RAZORPAY_WEBHOOK_SECRET: "test_razorpay_secret",
      GEMINI_API_KEY: "test_gemini_key",
      WHATSAPP_TOKEN: "test_whatsapp_token",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_VERIFY_TOKEN: "KIRANA_SECRET",
      NODE_ENV: "test"
    };

    // Use npx tsx server.ts
    this.serverProcess = spawn("npx", ["tsx", "server.ts"], { env, shell: true });

    this.serverProcess.stdout?.on("data", (data) => {
      console.log(`[SERVER-OUT] ${data.toString().trim()}`);
    });
    this.serverProcess.stderr?.on("data", (data) => {
      console.error(`[SERVER-ERR] ${data.toString().trim()}`);
    });

    // Wait for the Express server to be up using subscription verification GET endpoint
    let up = false;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await axios.get(`http://127.0.0.1:${this.serverPort}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=KIRANA_SECRET&hub.challenge=test`, { timeout: 100 });
        if (res.status === 200 && res.data === "test") {
          up = true;
          break;
        }
      } catch (err) {
        // Ignore and retry
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (!up) {
      throw new Error("Express server failed to start within timeout");
    }
    console.log(`[HARNESS] Express server started on port ${this.serverPort}`);
  }

  async stop() {
    if (this.serverProcess) {
      // Under Windows, taskkill or tree kill may be needed if shell: true spawns cmd
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(this.serverProcess.pid), "/f", "/t"]);
      } else {
        this.serverProcess.kill("SIGTERM");
      }
      await new Promise(r => setTimeout(r, 200));
    }
    await this.mockWhatsAppServer.stop();
  }

  // Database helper functions
  async clearDatabase() {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    const projectId = process.env.FIREBASE_PROJECT_ID || "kirana-bot-test";
    const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "kirana-inventory-db-test";

    if (emulatorHost) {
      try {
        const url = `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/${databaseId}/documents`;
        await axios.delete(url);
        return;
      } catch (err: any) {
        console.warn("[HARNESS] Failed to clear emulator database via endpoint, falling back to manual deletion:", err.message);
      }
    }

    // Fallback to manual recursive deletion for known test numbers to handle virtual documents
    const testPhones = ["919999999999", "918888888888", "917777777777"];
    for (const phone of testPhones) {
      const shopRef = db.collection("shops").doc(phone);
      await db.recursiveDelete(shopRef);
      const onboardingRef = db.collection("onboarding").doc(phone);
      await db.recursiveDelete(onboardingRef);
    }

    // Clear flat collections
    const collectionsToClear = ["onboarding", "parser_metrics", "webhook_receipts"];
    for (const colName of collectionsToClear) {
      const snapshot = await db.collection(colName).get();
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
    }
  }

  async seedUserProfile(phone: string, data: {
    shopName: string;
    ownerName: string;
    language: "english" | "telugu" | "hindi";
    billingStatus: "trial" | "active" | "expired";
    trialStartedDaysAgo?: number;
    pendingPriceFor?: string[];
  }) {
    let billing: any = { status: data.billingStatus };
    
    if (data.billingStatus === "trial") {
      const date = new Date();
      if (data.trialStartedDaysAgo !== undefined) {
        date.setDate(date.getDate() - data.trialStartedDaysAgo);
      } else {
        date.setDate(date.getDate() - 1);
      }
      billing.trialStartedAt = admin.firestore.Timestamp.fromDate(date);
    } else if (data.billingStatus === "active") {
      billing.trialStartedAt = admin.firestore.Timestamp.now();
      billing.activatedAt = admin.firestore.Timestamp.now();
    } else if (data.billingStatus === "expired") {
      const date = new Date();
      date.setDate(date.getDate() - 8);
      billing.trialStartedAt = admin.firestore.Timestamp.fromDate(date);
    }

    const docData: any = {
      phone,
      shopName: data.shopName,
      ownerName: data.ownerName,
      language: data.language,
      billing,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (data.pendingPriceFor !== undefined) {
      docData.pendingPriceFor = data.pendingPriceFor;
    }

    await db.collection("shops").doc(phone).collection("profile").doc("info").set(docData);
  }

  async seedInventoryItem(phone: string, itemName: string, quantity: number, price?: number, unit: string = "") {
    const itemKey = itemName.toLowerCase().trim();
    const data: any = {
      name: itemName,
      quantity,
      unit,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (price !== undefined) {
      data.price = price;
    }
    await db.collection("shops").doc(phone).collection("inventory").doc(itemKey).set(data);
  }

  async seedOnboardingState(phone: string, step: "awaiting_shop_name" | "awaiting_owner_name", language: "english" | "telugu" | "hindi", shopName?: string) {
    const data: any = { step, language };
    if (shopName) {
      data.shopName = shopName;
    }
    await db.collection("onboarding").doc(phone).set(data);
  }

  // Assertion helpers
  async assertInventoryItem(phone: string, itemName: string, expectedQty: number, expectedPrice?: number) {
    const itemKey = itemName.toLowerCase().trim();
    const doc = await db.collection("shops").doc(phone).collection("inventory").doc(itemKey).get();
    
    assert.ok(doc.exists, `Inventory item '${itemName}' does not exist!`);
    
    const data = doc.data()!;
    assert.strictEqual(data.quantity, expectedQty, `Expected quantity ${expectedQty}, got ${data.quantity}`);
    
    if (expectedPrice !== undefined) {
      assert.strictEqual(data.price, expectedPrice, `Expected price ${expectedPrice}, got ${data.price}`);
    }
  }

  async assertInventoryItemDoesNotExist(phone: string, itemName: string) {
    const itemKey = itemName.toLowerCase().trim();
    const doc = await db.collection("shops").doc(phone).collection("inventory").doc(itemKey).get();
    assert.ok(!doc.exists, `Inventory item '${itemName}' should not exist!`);
  }

  async assertProfileBillingStatus(phone: string, expectedStatus: string) {
    const doc = await db.collection("shops").doc(phone).collection("profile").doc("info").get();
    assert.ok(doc.exists, `Shop profile for '${phone}' does not exist!`);
    const data = doc.data()!;
    assert.ok(data.billing, "Billing structure not found");
    assert.strictEqual(data.billing.status, expectedStatus);
  }

  async assertTransactionLog(phone: string, action: "ADD" | "SELL", itemName: string, expectedQty: number) {
    const snapshot = await db.collection("shops").doc(phone).collection("logs").where("item", "==", itemName).get();
    
    assert.ok(!snapshot.empty, `No transaction logs found for item '${itemName}'`);
    
    const log = snapshot.docs.find(d => {
      const data = d.data();
      return data.action === action && data.quantity === expectedQty;
    });
    assert.ok(log, `No matching log found with action ${action} and quantity ${expectedQty}`);
    return log.data();
  }

  async assertParserMetric(phone: string, message: string, expectedParsedBy: "regex" | "gemini" | "unknown") {
    const snapshot = await db.collection("parser_metrics")
      .where("phone", "==", phone)
      .where("message", "==", message)
      .get();
      
    assert.ok(!snapshot.empty, `No parser metric logged for phone '${phone}' with message '${message}'`);
    const metric = snapshot.docs[0].data();
    assert.strictEqual(metric.parsedBy, expectedParsedBy, `Expected parsedBy to be '${expectedParsedBy}', got '${metric.parsedBy}'`);
    return metric;
  }

  // Webhook sending helpers
  async sendWhatsAppWebhook(payload: any, signature?: string) {
    const rawBody = JSON.stringify(payload);
    const headers: any = { "Content-Type": "application/json" };
    if (signature) {
      headers["x-hub-signature-256"] = signature;
    }
    return axios.post(`http://127.0.0.1:${this.serverPort}/api/webhook/whatsapp`, rawBody, { headers });
  }

  async sendRazorpayWebhook(payload: any, signature?: string) {
    const rawBody = JSON.stringify(payload);
    const headers: any = { "Content-Type": "application/json" };
    if (signature) {
      headers["x-razorpay-signature"] = signature;
    }
    return axios.post(`http://127.0.0.1:${this.serverPort}/api/webhook/razorpay`, rawBody, { headers });
  }

  // Signature computing helpers
  computeWhatsAppSignature(rawBody: string, appSecret: string): string {
    const hash = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");
    return `sha256=${hash}`;
  }

  computeRazorpaySignature(rawBody: string, webhookSecret: string): string {
    return crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
  }
}

export const harness = new TestHarness();
