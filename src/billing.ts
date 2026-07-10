import { config } from "./env.ts";
import type { Shop } from "./store.ts";

export interface AccessResult {
  allowed: boolean;
  reason?: "trial_expired" | "expired";
}

/**
 * Billing is optional and fully local: no payment gateway.
 * - BILLING_ENABLED=false (default): everyone has full access.
 * - BILLING_ENABLED=true: shops get TRIAL_DAYS of free use, after which the
 *   admin activates them manually (WhatsApp message: "activate <phone>").
 */
export function checkAccess(shop: Shop): AccessResult {
  if (!config.billingEnabled) return { allowed: true };

  const billing = shop.billing;
  if (billing.status === "active") return { allowed: true };
  if (billing.status === "expired") return { allowed: false, reason: "expired" };

  // trial
  const startedAt = new Date(billing.trialStartedAt).getTime();
  const diffDays = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
  if (diffDays <= config.trialDays) return { allowed: true };
  return { allowed: false, reason: "trial_expired" };
}
