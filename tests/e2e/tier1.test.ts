import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { harness } from "./harness.js";
import { db } from "../../src/database.js";
import admin from "firebase-admin";
import axios from "axios";

describe("KiranaAI E2E Tier 1 - Feature Coverage", () => {
  before(async () => {
    await harness.start();
  });

  after(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await harness.clearDatabase();
    harness.mockWhatsAppServer.clear();
  });

  // =========================================================================
  // Feature 1: Onboarding
  // =========================================================================
  describe("1. Onboarding Flow", () => {
    it("1.1: English User - Initial Greeting (Start Onboarding)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_101",
                from: "919999999999",
                type: "text",
                text: { body: "hello" }
              }]
            },
            field: "messages"
          }]
        }]
      };
      
      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);
      
      assert.strictEqual(res.status, 200);
      
      // Verify onboarding state in DB
      const state = await db.collection("onboarding").doc("919999999999").get();
      assert.ok(state.exists);
      assert.strictEqual(state.data()?.step, "awaiting_shop_name");
      assert.strictEqual(state.data()?.language, "english");

      // Verify mock outbound messages
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.strictEqual(requests[0].body.to, "919999999999");
      assert.ok(requests[0].body.text.body.includes("What is your shop name"));
    });

    it("1.2: Awaiting Shop Name - Provide Shop Name", async () => {
      await harness.seedOnboardingState("919999999999", "awaiting_shop_name", "english");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_102",
                from: "919999999999",
                type: "text",
                text: { body: "Metro Kirana Store" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify onboarding state in DB
      const state = await db.collection("onboarding").doc("919999999999").get();
      assert.ok(state.exists);
      assert.strictEqual(state.data()?.step, "awaiting_owner_name");
      assert.strictEqual(state.data()?.shopName, "Metro Kirana Store");

      // Verify mock outbound messages
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Metro Kirana Store registered"));
    });

    it("1.3: Awaiting Owner Name - Complete Onboarding", async () => {
      await harness.seedOnboardingState("919999999999", "awaiting_owner_name", "english", "Metro Kirana Store");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_103",
                from: "919999999999",
                type: "text",
                text: { body: "Ramesh Kumar" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify onboarding document deleted
      const state = await db.collection("onboarding").doc("919999999999").get();
      assert.ok(!state.exists);

      // Verify shop profile created
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.ok(profile.exists);
      assert.strictEqual(profile.data()?.shopName, "Metro Kirana Store");
      assert.strictEqual(profile.data()?.ownerName, "Ramesh Kumar");
      assert.strictEqual(profile.data()?.billing?.status, "trial");

      // Verify mock outbound messages
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Welcome Ramesh"));
    });

    it("1.4: Telugu User - Initial Greeting in Telugu (Start Onboarding)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_104",
                from: "918888888888",
                type: "text",
                text: { body: "namaskaram" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify onboarding state in DB is Telugu
      const state = await db.collection("onboarding").doc("918888888888").get();
      assert.ok(state.exists);
      assert.strictEqual(state.data()?.language, "telugu");

      // Verify mock outbound messages Telugu askShopName
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Mee shop peru cheppagalaru"));
    });

    it("1.5: Hindi User - Initial Greeting in Hindi (Start Onboarding)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_105",
                from: "917777777777",
                type: "text",
                text: { body: "namaste" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify onboarding state in DB is Hindi
      const state = await db.collection("onboarding").doc("917777777777").get();
      assert.ok(state.exists);
      assert.strictEqual(state.data()?.language, "hindi");

      // Verify mock outbound messages Hindi askShopName
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Apka shop ka naam kya hai"));
    });
  });

  // =========================================================================
  // Feature 2: WhatsApp Signatures
  // =========================================================================
  describe("2. WhatsApp Signatures", () => {
    it("2.1: Valid GET Webhook Subscription Verification (Verify Token)", async () => {
      const res = await axios.get(`http://127.0.0.1:${harness.serverPort}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=KIRANA_SECRET&hub.challenge=1158201444`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(String(res.data), "1158201444");
    });

    it("2.2: Valid POST Text Message Signature Verification", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_sig_202",
                from: "919999999999",
                type: "text",
                text: { body: "show inventory" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      // OUTBOUND verify
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
    });

    it("2.3: Valid POST Interactive Button Signature Verification", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_sig_203",
                from: "919999999999",
                type: "interactive",
                interactive: {
                  type: "button_reply",
                  button_reply: { id: "menu_inventory", title: "📦 View Stock" }
                }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
    });

    it("2.4: Valid POST Status Update Signature Verification (Ignored Event)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              statuses: [{
                id: "msg_id_sent_204",
                status: "delivered",
                timestamp: "1720584000",
                recipient_id: "919999999999"
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      // Verify no outbound messages sent
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 0);
    });

    it("2.5: Valid POST Media Message Signature Verification", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_id_media_205",
                from: "919999999999",
                type: "image",
                image: {
                  mime_type: "image/jpeg",
                  sha256: "abcdef...",
                  id: "media_id_301"
                }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 0);
    });
  });

  // =========================================================================
  // Feature 3: Webhook Idempotency
  // =========================================================================
  describe("3. Webhook Idempotency", () => {
    it("3.1: Unique Message (First Delivery)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "unique_id_301",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify document created in webhook_receipts
      const receipt = await db.collection("webhook_receipts").doc("unique_id_301").get();
      assert.ok(receipt.exists);

      // Verify stock incremented
      await harness.assertInventoryItem("919999999999", "soaps", 10);
    });

    it("3.2: Duplicate Text Message (Second Delivery)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });
      // Pre-seed receipt
      await db.collection("webhook_receipts").doc("unique_id_301").set({
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      // Pre-seed soaps inventory
      await harness.seedInventoryItem("919999999999", "soaps", 5, 20, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "unique_id_301",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify stock did NOT change (remained 5, not 15)
      await harness.assertInventoryItem("919999999999", "soaps", 5);

      // Verify no outbound messages sent this time
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 0);
    });

    it("3.3: Duplicate Interactive Button (Second Delivery)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });
      // Pre-seed receipt
      await db.collection("webhook_receipts").doc("unique_button_303").set({
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "unique_button_303",
                from: "919999999999",
                type: "interactive",
                interactive: {
                  type: "button_reply",
                  button_reply: { id: "menu_inventory", title: "📦 View Stock" }
                }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 0);
    });

    it("3.4: Concurrent Webhook Requests (Transaction Lock test)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10, 20, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "concurrent_id_304",
                from: "919999999999",
                type: "text",
                text: { body: "add 5 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      
      // Fire concurrently
      const [res1, res2] = await Promise.all([
        harness.sendWhatsAppWebhook(payload, sig),
        harness.sendWhatsAppWebhook(payload, sig)
      ]);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);

      // Verify stock incremented exactly once (10 -> 15, not 20)
      await harness.assertInventoryItem("919999999999", "soaps", 15);
    });

    it("3.5: Multiple Consecutive Unique Messages", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10, 20, "pcs");

      const payloadA = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "unique_id_A",
                from: "919999999999",
                type: "text",
                text: { body: "add 5 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sigA = harness.computeWhatsAppSignature(JSON.stringify(payloadA), "test_whatsapp_secret");
      const resA = await harness.sendWhatsAppWebhook(payloadA, sigA);
      assert.strictEqual(resA.status, 200);

      const payloadB = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "unique_id_B",
                from: "919999999999",
                type: "text",
                text: { body: "sold 3 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sigB = harness.computeWhatsAppSignature(JSON.stringify(payloadB), "test_whatsapp_secret");
      const resB = await harness.sendWhatsAppWebhook(payloadB, sigB);
      assert.strictEqual(resB.status, 200);

      // Verify final stock is 12 (10 + 5 - 3)
      await harness.assertInventoryItem("919999999999", "soaps", 12);
    });
  });

  // =========================================================================
  // Feature 4: Razorpay Billing
  // =========================================================================
  describe("4. Razorpay Billing", () => {
    it("4.1: Successful Billing Upgrade via notes.phone", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "trial"
      });

      const payload = {
        entity: "event",
        account_id: "acc_1001",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_99999",
              amount: 9900,
              currency: "INR",
              status: "captured",
              notes: {
                phone: "919999999999"
              }
            }
          }
        }
      };

      const sig = harness.computeRazorpaySignature(JSON.stringify(payload), "test_razorpay_secret");
      const res = await harness.sendRazorpayWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertProfileBillingStatus("919999999999", "active");
    });

    it("4.2: Successful Billing Upgrade via contact field", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "trial"
      });

      const payload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_88888",
              amount: 9900,
              currency: "INR",
              status: "captured",
              contact: "+919999999999",
              notes: {}
            }
          }
        }
      };

      const sig = harness.computeRazorpaySignature(JSON.stringify(payload), "test_razorpay_secret");
      const res = await harness.sendRazorpayWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertProfileBillingStatus("919999999999", "active");
    });

    it("4.3: Webhook with non-captured event (e.g. payment.failed)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "trial"
      });

      const payload = {
        entity: "event",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: "pay_77777",
              amount: 9900,
              status: "failed",
              notes: {
                phone: "919999999999"
              }
            }
          }
        }
      };

      const sig = harness.computeRazorpaySignature(JSON.stringify(payload), "test_razorpay_secret");
      const res = await harness.sendRazorpayWebhook(payload, sig);

      assert.strictEqual(res.status, 200); // Signature valid, returns 200
      await harness.assertProfileBillingStatus("919999999999", "trial"); // Not upgraded
    });

    it("4.4: Upgrade for a phone number with country-code cleanup", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "trial"
      });

      const payload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_66666",
              notes: {
                phone: "+91 99999-99999"
              }
            }
          }
        }
      };

      const sig = harness.computeRazorpaySignature(JSON.stringify(payload), "test_razorpay_secret");
      const res = await harness.sendRazorpayWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertProfileBillingStatus("919999999999", "active");
    });

    it("4.5: Upgrade message response from upgraded user (End-to-End lifecycle)", async () => {
      // 1. Seed expired user
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "expired"
      });

      // 2. User sends "add 10 soaps"
      const payloadA = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_life_1",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sigA = harness.computeWhatsAppSignature(JSON.stringify(payloadA), "test_whatsapp_secret");
      const resA = await harness.sendWhatsAppWebhook(payloadA, sigA);
      assert.strictEqual(resA.status, 200);

      // Verify user blocked & receives trialExpired template
      const requestsA = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requestsA.length, 1);
      assert.ok(requestsA[0].body.image.caption.includes("trial period is over"));

      // Clear captured outbound requests
      harness.mockWhatsAppServer.clear();

      // 3. Billing webhook received
      const payloadB = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_55555",
              notes: { phone: "919999999999" }
            }
          }
        }
      };
      const sigB = harness.computeRazorpaySignature(JSON.stringify(payloadB), "test_razorpay_secret");
      const resB = await harness.sendRazorpayWebhook(payloadB, sigB);
      assert.strictEqual(resB.status, 200);
      await harness.assertProfileBillingStatus("919999999999", "active");

      // 4. User sends "add 10 soaps" again
      const payloadC = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_life_2",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };
      const sigC = harness.computeWhatsAppSignature(JSON.stringify(payloadC), "test_whatsapp_secret");
      const resC = await harness.sendWhatsAppWebhook(payloadC, sigC);
      assert.strictEqual(resC.status, 200);

      // Verify stock addition succeeded
      await harness.assertInventoryItem("919999999999", "soaps", 10);
      const requestsC = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requestsC.length >= 1);
      assert.ok(requestsC[0].body.text.body.includes("Added 10 soaps"));
    });
  });

  // =========================================================================
  // Feature 5: Inventory ADD/SELL/Fuzzy
  // =========================================================================
  describe("5. Inventory ADD/SELL/Fuzzy", () => {
    it("5.1: Inventory ADD - New Item", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh Kumar",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_inv_501",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify Firestore changes
      await harness.assertInventoryItem("919999999999", "soaps", 10);
      
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.deepStrictEqual(profile.data()?.pendingPriceFor, ["soaps"]);
      
      await harness.assertTransactionLog("919999999999", "ADD", "soaps", 10);

      // Outbound check
      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 2); // Success message + Price prompt
      assert.ok(requests[0].body.text.body.includes("Added 10 soaps"));
      assert.ok(requests[1].body.text.body.includes("What is the selling price of Soaps"));
    });

    it("5.2: Inventory SELL - Sufficient Stock", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 15, 20, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_inv_502",
                from: "919999999999",
                type: "text",
                text: { body: "sold 5 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      await harness.assertInventoryItem("919999999999", "soaps", 10);
      await harness.assertTransactionLog("919999999999", "SELL", "soaps", 5);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("Sold 5 pcs soaps"));
    });

    it("5.3: Inventory ADD with Fuzzy Match Merging (First Word Match)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "santoor", 5, 15, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_inv_503",
                from: "919999999999",
                type: "text",
                text: { body: "add 5 santoor soap" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify santoor updated to 10
      await harness.assertInventoryItem("919999999999", "santoor", 10);
      await harness.assertInventoryItemDoesNotExist("919999999999", "santoor soap");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("santoor soap"));
      assert.ok(requests[0].body.text.body.includes("santoor"));
    });

    it("5.4: Inventory SELL - Unit Preservation", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "oil", 10, 120, "ltr");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_inv_504",
                from: "919999999999",
                type: "text",
                text: { body: "sold 3 oil" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify oil quantity is 7, unit remains ltr
      const item = await db.collection("shops").doc("919999999999").collection("inventory").doc("oil").get();
      assert.strictEqual(item.data()?.quantity, 7);
      assert.strictEqual(item.data()?.unit, "ltr");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("Sold 3 ltr Oil"));
    });

    it("5.5: Inventory ADD - Bulk Add", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_inv_505",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps and 5 chips" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify items created
      await harness.assertInventoryItem("919999999999", "soaps", 10);
      await harness.assertInventoryItem("919999999999", "chips", 5);

      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.deepStrictEqual(profile.data()?.pendingPriceFor, ["soaps", "chips"]);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 2);
      assert.ok(requests[0].body.text.body.includes("Stock updated"));
      assert.ok(requests[0].body.text.body.includes("Added 10 soaps"));
      assert.ok(requests[0].body.text.body.includes("Added 5 chips"));
      assert.ok(requests[1].body.text.body.includes("What is the selling price of Soaps"));
    });
  });

  // =========================================================================
  // Feature 6: Price Queue
  // =========================================================================
  describe("6. Price Queue", () => {
    it("6.1: Queue Ingestion on Add", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_pr_601",
                from: "919999999999",
                type: "text",
                text: { body: "add 20 surf excel" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify queue has surf excel
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.deepStrictEqual(profile.data()?.pendingPriceFor, ["surf excel"]);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 2);
      assert.ok(requests[1].body.text.body.includes("What is the selling price of Surf excel"));
    });

    it("6.2: Single Price Confirmation", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active",
        pendingPriceFor: ["surf excel"]
      });
      await harness.seedInventoryItem("919999999999", "surf excel", 20);

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_pr_602",
                from: "919999999999",
                type: "text",
                text: { body: "50" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify price set
      await harness.assertInventoryItem("919999999999", "surf excel", 20, 50);

      // Verify queue empty
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.ok(!profile.data()?.pendingPriceFor || profile.data()?.pendingPriceFor.length === 0);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Surf excel price saved: ₹50"));
    });

    it("6.3: Multiple Items Queued - Price Processing (First Item)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active",
        pendingPriceFor: ["soaps", "chips"]
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10);
      await harness.seedInventoryItem("919999999999", "chips", 5);

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_pr_603",
                from: "919999999999",
                type: "text",
                text: { body: "40" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // soaps price set
      await harness.assertInventoryItem("919999999999", "soaps", 10, 40);

      // queue updated to chips
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.deepStrictEqual(profile.data()?.pendingPriceFor, ["chips"]);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 2); // Confirmation + Next prompt
      assert.ok(requests[0].body.text.body.includes("Soaps price saved: ₹40"));
      assert.ok(requests[1].body.text.body.includes("What is the selling price of Chips"));
    });

    it("6.4: Multiple Items Queued - Price Processing (Second Item)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active",
        pendingPriceFor: ["chips"]
      });
      await harness.seedInventoryItem("919999999999", "chips", 5);

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_pr_604",
                from: "919999999999",
                type: "text",
                text: { body: "20" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // chips price set
      await harness.assertInventoryItem("919999999999", "chips", 5, 20);

      // queue empty
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.ok(!profile.data()?.pendingPriceFor || profile.data()?.pendingPriceFor.length === 0);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Chips price saved: ₹20"));
    });

    it("6.5: Direct Price Set Command (Bypassing Queue)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10, 15);

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_pr_605",
                from: "919999999999",
                type: "text",
                text: { body: "price of soaps is 35" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // soaps price updated
      await harness.assertInventoryItem("919999999999", "soaps", 10, 35);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Soaps price updated to ₹35"));
    });
  });

  // =========================================================================
  // Feature 7: Queries & Reports
  // =========================================================================
  describe("7. Queries & Reports", () => {
    it("7.1: View Stock - Populated Inventory", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10, 20, "pcs");
      await harness.seedInventoryItem("919999999999", "chips", 5, 10, "pkts");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_qr_701",
                from: "919999999999",
                type: "text",
                text: { body: "show inventory" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      const text = requests[0].body.text.body;
      assert.ok(text.includes("chips: 5 pkts"));
      assert.ok(text.includes("soaps: 10 pcs"));
      // Assert alphabetical sorting (chips before soaps)
      assert.ok(text.indexOf("chips") < text.indexOf("soaps"));
    });

    it("7.2: View Stock - Empty Inventory", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_qr_702",
                from: "919999999999",
                type: "text",
                text: { body: "stock list" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Stock emi ledu"));
    });

    it("7.3: Today's Report - Multiple Sales with Prices", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10, 20, "pcs");
      await harness.seedInventoryItem("919999999999", "chips", 10, 15, "pkts");

      // Seed logs for today
      const logsRef = db.collection("shops").doc("919999999999").collection("logs");
      await logsRef.add({
        action: "SELL",
        item: "soaps",
        quantity: 3,
        unit: "pcs",
        price: 20,
        revenue: 60,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      await logsRef.add({
        action: "SELL",
        item: "chips",
        quantity: 2,
        unit: "pkts",
        price: 15,
        revenue: 30,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_qr_703",
                from: "919999999999",
                type: "text",
                text: { body: "today report" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      const bodyText = requests[0].body.text.body;
      assert.ok(bodyText.includes("Sold Chips: 2 (₹30)"));
      assert.ok(bodyText.includes("Sold Soaps: 3 (₹60)"));
      assert.ok(bodyText.includes("Mottam aaya: ₹90"));
    });

    it("7.4: Today's Report - No Sales Today", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_qr_704",
                from: "919999999999",
                type: "text",
                text: { body: "report" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("No transactions today yet"));
    });

    it("7.5: Today's Report - Empty with Telugu Language Context", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "telugu",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_qr_705",
                from: "919999999999",
                type: "text",
                text: { body: "report" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Neti transactions emi levu"));
    });
  });

  // =========================================================================
  // Feature 8: Low Stock Alerts
  // =========================================================================
  describe("8. Low Stock Alerts", () => {
    it("8.1: Immediate Low Stock Alert on Sale", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 8, 15, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ls_801",
                from: "919999999999",
                type: "text",
                text: { body: "sold 4 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertInventoryItem("919999999999", "soaps", 4);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("Sold 4 pcs soaps"));
      assert.ok(requests[0].body.text.body.includes("Low stock: soaps only 4 left"));
    });

    it("8.2: Low Stock List Query - Populated List", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ravi",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 3, 15, "pcs");
      await harness.seedInventoryItem("919999999999", "chips", 8, 10, "pkts");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ls_802",
                from: "919999999999",
                type: "text",
                text: { body: "low stock" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      const text = requests[0].body.text.body;
      assert.ok(text.includes("Ravi, items to reorder"));
      assert.ok(text.includes("Soaps: only 3 pcs left"));
      assert.ok(!text.includes("chips")); // chips is 8 >= 5
    });

    it("8.3: Low Stock List Query - All Good Stock (Empty Alert)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ravi",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 10);

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ls_803",
                from: "919999999999",
                type: "text",
                text: { body: "takkuva stock" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Ravi, all items have good stock"));
    });

    it("8.4: Low Stock Alert with Telugu Language Context", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "telugu",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 9, 15, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ls_804",
                from: "919999999999",
                type: "text",
                text: { body: "sold 5 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertInventoryItem("919999999999", "soaps", 4);

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("5 pcs soaps ammamu"));
      assert.ok(requests[0].body.text.body.includes("Stock takkuva: soaps kevalam 4 pcs undhi"));
    });

    it("8.5: Low Stock Alert at Zero Stock (Out of Stock)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });
      await harness.seedInventoryItem("919999999999", "soaps", 3, 15, "pcs");

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ls_805",
                from: "919999999999",
                type: "text",
                text: { body: "sold 5 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);
      await harness.assertInventoryItem("919999999999", "soaps", 0); // Clamped to 0

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("Sold 5 pcs soaps"));
      assert.ok(requests[0].body.text.body.includes("Low stock: soaps only 0 left"));
    });
  });

  // =========================================================================
  // Feature 9: Language Detection
  // =========================================================================
  describe("9. Language Detection", () => {
    it("9.1: Automatic Language Switch to Telugu", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ld_901",
                from: "919999999999",
                type: "text",
                text: { body: "anna stock list cheppu" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify language switched in Firestore
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.strictEqual(profile.data()?.language, "telugu");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Ramesh anna, mee inventory idi"));
    });

    it("9.2: Automatic Language Switch to Hindi", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ld_902",
                from: "919999999999",
                type: "text",
                text: { body: "bhai stock dikao" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify language switched in Firestore
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.strictEqual(profile.data()?.language, "hindi");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Ramesh bhai, aapki inventory"));
    });

    it("9.3: Telugu Language Retention", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "telugu",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ld_903",
                from: "919999999999",
                type: "text",
                text: { body: "add 10 soaps" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify language remains Telugu
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.strictEqual(profile.data()?.language, "telugu");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.ok(requests.length >= 1);
      assert.ok(requests[0].body.text.body.includes("soaps add chesamu"));
    });

    it("9.4: Multi-lingual Input Detection (Telugu Priority)", async () => {
      await harness.seedUserProfile("919999999999", {
        shopName: "Metro Kirana Store",
        ownerName: "Ramesh",
        language: "english",
        billingStatus: "active"
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ld_904",
                from: "919999999999",
                type: "text",
                text: { body: "namaste anna" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify language switched to Telugu (due to priority of anna over namaste)
      const profile = await db.collection("shops").doc("919999999999").collection("profile").doc("info").get();
      assert.strictEqual(profile.data()?.language, "telugu");
    });

    it("9.5: Language Switch during Onboarding (Initial Contact)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "msg_ld_905",
                from: "919999999999",
                type: "text",
                text: { body: "namaste" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const sig = harness.computeWhatsAppSignature(JSON.stringify(payload), "test_whatsapp_secret");
      const res = await harness.sendWhatsAppWebhook(payload, sig);

      assert.strictEqual(res.status, 200);

      // Verify onboarding created in Hindi
      const state = await db.collection("onboarding").doc("919999999999").get();
      assert.ok(state.exists);
      assert.strictEqual(state.data()?.language, "hindi");

      const requests = harness.mockWhatsAppServer.capturedRequests;
      assert.strictEqual(requests.length, 1);
      assert.ok(requests[0].body.text.body.includes("Kirana AI mein swagat"));
    });
  });
});
