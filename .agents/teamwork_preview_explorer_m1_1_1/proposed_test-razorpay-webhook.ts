import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import { getUser, setBillingStatus, db } from "../src/database";
import admin from "firebase-admin";

dotenv.config();

const url = "http://localhost:3000/api/webhook/razorpay";
const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "test_secret";

async function runTest() {
  console.log("==========================================");
  console.log("🧪 TESTING RAZORPAY WEBHOOK INTEGRATION");
  console.log("==========================================");

  const testPhone = "919999999999";

  // 1. Ensure test shop profile exists and reset it to 'trial'
  console.log(`[PRE-TEST] Preparing Firestore for shop: ${testPhone}`);
  const profile = await getUser(testPhone);
  if (!profile) {
    console.log(`[PRE-TEST] Shop profile does not exist. Creating dummy shop profile...`);
    const profileRef = db.collection("shops").doc(testPhone).collection("profile").doc("info");
    await profileRef.set({
      phone: testPhone,
      shopName: "Test Shop",
      ownerName: "Test Owner",
      language: "english",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Reset to trial status to verify the activation works
  await setBillingStatus(testPhone, "trial");
  console.log(`[PRE-TEST] Reset billing status of ${testPhone} to "trial"`);

  // Helper to generate signature
  function getSignature(bodyString: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(bodyString)
      .digest("hex");
  }

  // Test Case 1: Valid payment.captured event using notes.phone
  console.log("\n🚀 Running Test Case 1: Valid signature, event payment.captured (using notes.phone)...");
  const payload1 = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_123",
          entity: "payment",
          amount: 9900,
          currency: "INR",
          status: "captured",
          contact: "+910000000000",
          notes: {
            phone: testPhone
          }
        }
      }
    }
  };
  const bodyStr1 = JSON.stringify(payload1);
  const sig1 = getSignature(bodyStr1);

  try {
    const res = await axios.post(url, bodyStr1, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sig1
      }
    });
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Data:`, res.data);

    // Verify Firestore billing status is now active
    const updatedProfile = await getUser(testPhone);
    const billing = updatedProfile?.billing;
    if (billing && billing.status === "active" && billing.activatedAt) {
      console.log("✅ Test Case 1 PASSED: Firestore billing status is active!");
    } else {
      console.error("❌ Test Case 1 FAILED: Firestore billing status was not updated correctly.", billing);
    }
  } catch (error: any) {
    console.error("❌ Test Case 1 FAILED with error:", error.response?.data || error.message);
  }

  // Test Case 2: Invalid signature
  console.log("\n🚀 Running Test Case 2: Invalid signature...");
  try {
    await axios.post(url, bodyStr1, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_signature_hash"
      }
    });
    console.error("❌ Test Case 2 FAILED: Request succeeded but should have failed with 400.");
  } catch (error: any) {
    if (error.response && error.response.status === 400) {
      console.log("✅ Test Case 2 PASSED: Correctly rejected with status 400 Bad Request");
    } else {
      console.error("❌ Test Case 2 FAILED: Expected 400 but got:", error.response?.status || error.message);
    }
  }

  // Test Case 3: Other event (ignored)
  console.log("\n🚀 Running Test Case 3: Ignored event (payment.failed)...");
  // Reset status to trial first
  await setBillingStatus(testPhone, "trial");
  const payload3 = {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_test_456",
          entity: "payment",
          amount: 9900,
          status: "failed",
          contact: "+910000000000",
          notes: {
            phone: testPhone
          }
        }
      }
    }
  };
  const bodyStr3 = JSON.stringify(payload3);
  const sig3 = getSignature(bodyStr3);

  try {
    const res = await axios.post(url, bodyStr3, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sig3
      }
    });
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Data:`, res.data);

    // Verify Firestore billing status remains trial
    const updatedProfile = await getUser(testPhone);
    const billing = updatedProfile?.billing;
    if (billing && billing.status === "trial") {
      console.log("✅ Test Case 3 PASSED: Firestore billing status remained trial!");
    } else {
      console.error("❌ Test Case 3 FAILED: Firestore billing status changed when it should not have.", billing);
    }
  } catch (error: any) {
    console.error("❌ Test Case 3 FAILED with error:", error.response?.data || error.message);
  }

  // Test Case 4: Non-existent shop phone
  console.log("\n🚀 Running Test Case 4: Non-existent shop phone...");
  const fakePhone = "918888888888";
  // Ensure fake phone does not exist in db
  await db.collection("shops").doc(fakePhone).delete();

  const payload4 = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_789",
          entity: "payment",
          amount: 9900,
          status: "captured",
          contact: "+918888888888",
          notes: {}
        }
      }
    }
  };
  const bodyStr4 = JSON.stringify(payload4);
  const sig4 = getSignature(bodyStr4);

  try {
    await axios.post(url, bodyStr4, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sig4
      }
    });
    console.error("❌ Test Case 4 FAILED: Request succeeded but should have failed with 404.");
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.log("✅ Test Case 4 PASSED: Correctly returned 404 Not Found");
    } else {
      console.error("❌ Test Case 4 FAILED: Expected 404 but got:", error.response?.status || error.message);
    }
  }

  console.log("\n==========================================");
  console.log("🎉 ALL TESTS EXECUTED");
  console.log("==========================================");
}

runTest().catch(console.error);
