import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader (replaces the dotenv package).
 * Lines are KEY=VALUE; surrounding single/double quotes are stripped.
 * Existing process.env values always win.
 */
function loadDotEnv(file: string = ".env"): void {
  const envPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT) || 3000,

  // WhatsApp Cloud API — the only external service this app talks to.
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "KIRANA_SECRET",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || "",
  whatsappBaseUrl: process.env.WHATSAPP_BASE_URL || "https://graph.facebook.com",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || "v20.0",

  // Local storage
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), "data"),

  // Billing is optional. When disabled (default) every shop has full access.
  billingEnabled: process.env.BILLING_ENABLED === "true",
  trialDays: Number(process.env.TRIAL_DAYS) || 7,
  adminPhone: (process.env.ADMIN_PHONE || "").replace(/\D/g, ""),
  merchantUpiId: process.env.MERCHANT_UPI_ID || "",
  supportContact: process.env.SUPPORT_CONTACT || "",

  lowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD) || 5,

  // Agent (predictive analytics) — all local, no API.
  agentVelocityDays: Number(process.env.AGENT_VELOCITY_DAYS) || 14, // trailing window for sales velocity
  agentLeadTimeDays: Number(process.env.AGENT_LEAD_TIME_DAYS) || 3, // reorder when stock lasts <= this
  agentReorderHorizonDays: Number(process.env.AGENT_REORDER_HORIZON_DAYS) || 7, // order enough to cover this
  agentDeadStockDays: Number(process.env.AGENT_DEAD_STOCK_DAYS) || 21, // no sale in this many days = dead stock
  agentKhataOverdueDays: Number(process.env.AGENT_KHATA_OVERDUE_DAYS) || 15, // udhaar older than this = overdue
  agentWarmupDays: Number(process.env.AGENT_WARMUP_DAYS) || 7, // need this much history before velocity insights
};

export type Config = typeof config;
