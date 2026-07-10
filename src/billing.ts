import { getBilling } from "./database";

export async function checkAccess(phone: string, profile?: any): Promise<{ allowed: boolean; reason?: string }> {
  const billing = profile?.billing || await getBilling(phone);
  
  if (billing.status === "active") {
    return { allowed: true };
  }
  
  if (billing.status === "trial") {
    let trialStartedAt = billing.trialStartedAt;
    if (!trialStartedAt) {
      const freshBilling = await getBilling(phone);
      trialStartedAt = freshBilling.trialStartedAt;
    }
    
    const now = Date.now();
    // In case trialStartedAt is a Firestore Timestamp or date string / object
    const trialTime = (trialStartedAt && typeof trialStartedAt.toDate === "function")
      ? trialStartedAt.toDate().getTime() 
      : (trialStartedAt ? new Date(trialStartedAt).getTime() : now);
      
    const diffMs = now - trialTime;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays <= 7) {
      return { allowed: true };
    }
    
    return { allowed: false, reason: "trial_expired" };
  }
  
  if (billing.status === "expired") {
    return { allowed: false, reason: "trial_expired" };
  }
  
  return { allowed: false, reason: "unknown" };
}

