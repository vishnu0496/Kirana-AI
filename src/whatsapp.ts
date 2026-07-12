import { config } from "./env.ts";

// WhatsApp Cloud API client — the only external service this app calls.
// Uses the built-in fetch (Node 18+), no HTTP library needed.

const MAX_TEXT_LENGTH = 4096; // WhatsApp text body limit

export interface Button {
  id: string;
  title: string; // max 20 chars per WhatsApp API
}

// Optional outbound override: lets the CLI chat mode (and anything else)
// intercept messages instead of calling the WhatsApp Cloud API.
export type OutboundHandler = (payload: Record<string, unknown>) => void | Promise<void>;
let outboundOverride: OutboundHandler | null = null;

export function setOutboundOverride(handler: OutboundHandler | null): void {
  outboundOverride = handler;
}

async function post(payload: Record<string, unknown>, attempt = 1): Promise<boolean> {
  if (outboundOverride) {
    await outboundOverride(payload);
    return false; // suppress the "[WA] Sent" logs; the override owns output
  }
  if (!config.whatsappToken || !config.whatsappPhoneId) {
    console.warn("[WA] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set — skipping send");
    return false;
  }
  const url = `${config.whatsappBaseUrl}/${config.whatsappApiVersion}/${config.whatsappPhoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[WA ERROR] ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      // Retry once on server-side errors.
      if (res.status >= 500 && attempt === 1) {
        await new Promise((r) => setTimeout(r, 500));
        return post(payload, 2);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error("[WA ERROR]", err instanceof Error ? err.message : err);
    if (attempt === 1) {
      await new Promise((r) => setTimeout(r, 500));
      return post(payload, 2);
    }
    return false;
  }
}

export async function sendText(to: string, text: string): Promise<void> {
  // Split long messages instead of letting the API reject them.
  for (let i = 0; i < text.length; i += MAX_TEXT_LENGTH) {
    const chunk = text.slice(i, i + MAX_TEXT_LENGTH);
    const ok = await post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: chunk },
    });
    if (ok) console.log(`[WA] Sent to ${to}: ${chunk.slice(0, 60).replace(/\n/g, " ")}...`);
  }
}

/** Downloads a WhatsApp media attachment (two-step Cloud API flow) and returns it as UTF-8 text. */
export async function downloadMedia(mediaId: string): Promise<string | null> {
  if (!config.whatsappToken) return null;
  try {
    const metaRes = await fetch(`${config.whatsappBaseUrl}/${config.whatsappApiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.whatsappToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string };
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${config.whatsappToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!fileRes.ok) return null;
    return Buffer.from(await fileRes.arrayBuffer()).toString("utf-8");
  } catch (err) {
    console.error("[WA MEDIA ERROR]", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function sendButtons(to: string, bodyText: string, buttons: Button[]): Promise<void> {
  const ok = await post({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
  if (ok) console.log(`[WA BUTTONS] Sent to ${to}: ${bodyText.slice(0, 60).replace(/\n/g, " ")}...`);
}
