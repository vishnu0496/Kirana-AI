import axios from "axios";

async function main() {
  const url = "http://localhost:3000/api/webhook/whatsapp";
  const payload = {
    text: "add 10 biscuits",
    from: "919999999999",
    id: "test_msg_id_" + Math.random().toString(36).substring(7)
  };

  console.log("==========================================");
  console.log("🧪 TESTING WEBHOOK IDEMPOTENCY");
  console.log("==========================================");
  console.log(`Sending message: "${payload.text}" with ID: "${payload.id}"`);
  
  try {
    console.log("\n🚀 Sending Request #1...");
    const res1 = await axios.post(url, payload);
    console.log(`Response Status: ${res1.status}`);
    
    console.log("\n🚀 Sending Request #2 (Duplicate ID)...");
    const res2 = await axios.post(url, payload);
    console.log(`Response Status: ${res2.status}`);
    console.log("\n✅ Done! Check server logs to verify it bypassed processing.");
  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  }
  console.log("==========================================\n");
}

main().catch(console.error);
export {};
