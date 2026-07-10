import { db, setBillingStatus } from "../src/database";
import admin from "firebase-admin";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage:");
    console.log("  npx tsx scratch/manage-billing.ts <phone> <status|simulate-old>");
    console.log("  status can be: active | trial | expired");
    console.log("  simulate-old will set trialStartedAt to 8 days ago");
    process.exit(1);
  }

  const phone = args[0];
  const command = args[1];

  if (command === "simulate-old") {
    const profileRef = db.collection("shops").doc(phone).collection("profile").doc("info");
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    const trialStartedAt = admin.firestore.Timestamp.fromDate(eightDaysAgo);
    
    await profileRef.set({
      billing: {
        status: "trial",
        trialStartedAt
      }
    }, { merge: true });
    console.log(`[SUCCESS] Simulated old trial for ${phone} (started at ${eightDaysAgo.toISOString()})`);
  } else if (command === "active" || command === "trial" || command === "expired") {
    await setBillingStatus(phone, command);
    console.log(`[SUCCESS] Set billing status for ${phone} to "${command}"`);
  } else {
    console.log(`Unknown command: ${command}`);
  }
}

main().catch(console.error);
export {};
