import { config } from "./env";

// WhatsApp Cloud API client — the only external service this app calls.
// Uses the built-in fetch (Node 18+), no HTTP library needed.

const MAX_TEXT_LENGTH = 4096; // WhatsApp text body limit

export interface Button {
  id: string;
  title: string; // max 20 chars per WhatsApp API
}

async function post(payload: Record<string, unknown>, attempt = 1): Promise<boolean> {
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
