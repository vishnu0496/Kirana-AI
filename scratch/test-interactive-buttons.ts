import axios from "axios";

async function main() {
  const url = "http://localhost:3000/api/webhook/whatsapp";
  const buttonsToTest = [
    { id: "menu_inventory", title: "📦 View Stock" },
    { id: "menu_report", title: "💰 Today's Report" },
    { id: "menu_low_stock", title: "⚠️ Low Stock" }
  ];

  console.log("==========================================");
  console.log("🧪 TESTING INTERACTIVE BUTTON PAYLOADS");
  console.log("==========================================");

  for (const button of buttonsToTest) {
    const payload = {
      text: button.title,
      from: "919999999999",
      id: "btn_test_id_" + Math.random().toString(36).substring(7),
      buttonId: button.id
    };

    console.log(`\n🚀 Sending Tap for Button: "${button.title}" (ID: ${button.id})...`);
    try {
      const res = await axios.post(url, payload);
      console.log(`Response Status: ${res.status}`);
      console.log("✅ Check server logs to verify it processed the mapped action.");
    } catch (error: any) {
      console.error("❌ Test failed:", error.response?.data || error.message);
    }
  }
  console.log("==========================================\n");
}

main().catch(console.error);
export {};
