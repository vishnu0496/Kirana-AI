import { db } from "../src/database";

async function main() {
  console.log("[METRICS] Fetching parser metrics from Firestore...");
  const snapshot = await db.collection("parser_metrics").get();
  
  if (snapshot.empty) {
    console.log("No parser metrics found yet!");
    return;
  }

  let regexCount = 0;
  let geminiCount = 0;
  let unknownCount = 0;
  const total = snapshot.size;

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.parsedBy === "regex") {
      regexCount++;
    } else if (data.parsedBy === "gemini") {
      geminiCount++;
    } else {
      unknownCount++;
    }
  });

  const regexPercent = ((regexCount / total) * 100).toFixed(1);
  const geminiPercent = ((geminiCount / total) * 100).toFixed(1);
  const unknownPercent = ((unknownCount / total) * 100).toFixed(1);

  console.log("\n==================================");
  console.log(`📊 PARSER PERFORMANCE METRICS`);
  console.log("==================================");
  console.log(`Total messages processed: ${total}`);
  console.log(`• Regex/Rules matches:   ${regexCount} (${regexPercent}%)`);
  console.log(`• Gemini fallback matches: ${geminiCount} (${geminiPercent}%)`);
  console.log(`• Not Understood/Unknown:  ${unknownCount} (${unknownPercent}%)`);
  console.log("==================================\n");
}

main().catch(console.error);
export {};
