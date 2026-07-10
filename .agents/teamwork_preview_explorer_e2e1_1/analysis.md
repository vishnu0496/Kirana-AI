# E2E Test Infra & Webhook Hardening Analysis

This report analyzes the KiranaAI Bot codebase and proposes an architectural design for the End-to-End (E2E) testing infrastructure, environment setup, Express server lifecycle control, and webhook signature verification logic.

---

## 1. E2E Test Runner Comparison

To test the Express-based TypeScript application, we consider two main testing runners. Given that `"type": "module"` is configured in `package.json` and execution relies on `tsx`, ESM-native support is critical.

| Criteria | Option A: Vitest (Recommended) | Option B: Node.js Native Test Runner (`node:test`) |
|---|---|---|
| **Setup Cost** | Low. Requires adding `vitest` as a devDependency. | Zero. Built into Node.js (v18+). |
| **TS/ESM Support** | Seamless out-of-the-box support for TypeScript and ESM. | Requires execution via `tsx --test`. |
| **Mocking Capabilities** | Rich built-in mocking (`vi.mock`, `vi.spyOn`), essential for stubbing external packages (like `@google/generative-ai` or `axios`). | Minimal. Mocking requires manual dependency injection or wrapping modules. |
| **Execution Speed** | Extremely fast, multi-threaded parallel execution. | Fast, simple, single-threaded or multi-process. |
| **Assertion Library** | Built-in Jest-compatible `expect` syntax. | Uses Node's native `node:assert`, which is functional but verbose. |

### Recommendation
**Vitest** is recommended because E2E tests will need to mock Gemini AI (`@google/generative-ai`) and verify outgoing WhatsApp API messages (`axios.post`). Vitest provides standard Jest-like module mocking, making in-process testing very clean. 

If zero external devDependencies is a strict constraint, **Node's native `node:test`** can be executed using:
```bash
npx tsx --test tests/**/*.test.ts
```

---

## 2. Express Server Lifecycle Control

Currently, `server.ts` initializes the server and immediately listens on `PORT`:
```typescript
// server.ts (Line 450)
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
```
This poses an issue for testing because importing `server.ts` starts a persistent server that cannot be shut down programmatically (since the server instance returned by `app.listen()` is not exported).

We propose two options to control the server lifecycle:

### Option A: In-Process Control (Refactored Export)
Refactor `server.ts` to export `app` and conditionally run `listen()` only when executed as the main process.

1. **Refactor `server.ts`**:
   ```typescript
   export const app = express();
   // ... middleware and routes ...

   // Start server only when executed directly, not when imported
   if (process.env.NODE_ENV !== "test") {
     const server = app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
   }
   ```
2. **In-Test Lifecycle**:
   Use `supertest` to test `app` without manually starting a listener, or start/stop the server manually:
   ```typescript
   import { app } from "../server";
   import { http } from "http";

   let server: http.Server;
   let port: number;

   beforeAll(async () => {
     // Dynamic Port Allocation: Bind to 0 to let OS select a free port
     server = app.listen(0);
     port = (server.address() as any).port;
   });

   afterAll(() => {
     server.close();
   });
   ```

### Option B: Out-of-Process Control (Process Spawning)
Run tests in a completely isolated environment by spawning the server in a separate Node process.

1. **Dynamic Port Allocation**:
   Use a helper function to find an open port on the host machine.
2. **Spawning the Server**:
   ```typescript
   import { spawn, ChildProcess } from "child_process";
   import net from "net";

   // Helper to find a free port
   async function getFreePort(): Promise<number> {
     return new Promise((resolve) => {
       const srv = net.createServer();
       srv.listen(0, () => {
         const port = (srv.address() as any).port;
         srv.close(() => resolve(port));
       });
     });
   }

   let serverProcess: ChildProcess;
   let testPort: number;

   beforeAll(async () => {
     testPort = await getFreePort();
     serverProcess = spawn("npx", ["tsx", "server.ts"], {
       env: {
         ...process.env,
         PORT: String(testPort),
         NODE_ENV: "test",
         FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"
       }
     });

     // Wait for server to print startup log
     await new Promise((resolve) => {
       serverProcess.stdout?.on("data", (data) => {
         if (data.toString().includes("Server running on port")) {
           resolve(true);
         }
       });
     });
   });

   afterAll(() => {
     serverProcess.kill("SIGTERM");
   });
   ```

---

## 3. Environment Setup & Database Isolation

To prevent E2E tests from polluting production data or running up API costs, the testing environment must be configured with a local Firestore emulator and mock credentials.

### Environment Variable Suite
Configure the following env vars in the test command runner or a `.env.test` file:
```env
NODE_ENV="test"
PORT=0 # Ephemeral port for Express
FIREBASE_PROJECT_ID="kirana-bot-test"
FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
WHATSAPP_APP_SECRET="test_whatsapp_secret"
RAZORPAY_WEBHOOK_SECRET="test_razorpay_secret"
GEMINI_API_KEY="test_gemini_key"
WHATSAPP_TOKEN="test_whatsapp_token"
WHATSAPP_PHONE_NUMBER_ID="123456789"
```

### Firestore Database Isolation & Cleanup
Since Firestore Admin SDK respects `FIRESTORE_EMULATOR_HOST`, it will automatically route all operations to the emulator when that env var is set.
To ensure test case isolation, we should clear the Firestore Emulator between test runs.
1. **Via Firebase REST API (Recommended)**:
   The Firestore Emulator exposes a REST endpoint to clear all database documents. We can trigger this in a `beforeEach` hook:
   ```typescript
   import axios from "axios";

   async function clearEmulatorDatabase() {
     const projectId = process.env.FIREBASE_PROJECT_ID || "kirana-bot-test";
     const url = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`;
     await axios.delete(url);
   }
   ```
2. **Via Firestore Admin SDK**:
   Recursively delete collections using the admin library, though the REST API is faster and clears all metadata.

---

## 4. Webhook Signature Verification

Both Meta (WhatsApp) and Razorpay send headers containing SHA256 HMAC signatures of the raw request payload. In Express, raw body content is discarded after `bodyParser.json()` processes it. We must ensure the server preserves this, and tests generate correct matching signatures.

### Capture Raw Request Body (Server Change Proposal)
To allow webhook verification handlers to calculate HMAC on the exact incoming payload string, modify the middleware registration in `server.ts` to capture the raw body as a buffer:
```typescript
// server.ts (Line 44 modification proposal)
app.use(
  bodyParser.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf; // Store the raw buffer
    }
  })
);
```

### Proposing Verification in Tests
The tests will generate signatures by taking the raw JSON string of the payload and hashing it using HMAC-SHA256 with the corresponding environment secrets.

#### A. WhatsApp (Meta Signature)
- **Header**: `x-hub-signature-256`
- **Format**: `sha256=<hex_digest>`
- **Secret**: `WHATSAPP_APP_SECRET`

**Test Helper Code**:
```typescript
import crypto from "crypto";

export function signWhatsAppPayload(rawBody: string, appSecret: string): string {
  const hash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return `sha256=${hash}`;
}
```

#### B. Razorpay Signature
- **Header**: `x-razorpay-signature`
- **Format**: `<hex_digest>`
- **Secret**: `RAZORPAY_WEBHOOK_SECRET`

**Test Helper Code**:
```typescript
import crypto from "crypto";

export function signRazorpayPayload(rawBody: string, webhookSecret: string): string {
  return crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
}
```

### Complete Payload Simulation Flow
In a test, simulate the request as follows:
```typescript
const payload = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_test_123",
        amount: 9900,
        notes: { phone: "919999999999" }
      }
    }
  }
};

const rawBody = JSON.stringify(payload);
const signature = signRazorpayPayload(rawBody, "test_razorpay_secret");

const response = await axios.post("http://localhost:" + port + "/api/webhook/razorpay", rawBody, {
  headers: {
    "Content-Type": "application/json",
    "x-razorpay-signature": signature
  }
});
```
