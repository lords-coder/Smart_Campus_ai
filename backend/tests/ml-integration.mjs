/**
 * ML integration test: the Express -> Python ML path and its degradation modes.
 *
 * Bootstraps a second backend instance on a spare port with ML_SERVICE_URL
 * pointed at a controllable endpoint, so each failure mode (unreachable,
 * timeout, 5xx, malformed body) is exercised for real rather than asserted
 * about. Nothing here mocks the API itself — every assertion is made against a
 * live HTTP response from a live backend process.
 *
 * Run:  node tests/ml-integration.mjs
 * Prereq: PostgreSQL up and seeded (npm run db:reset -- --yes && npm run seed)
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = 4187;
const BASE = `http://127.0.0.1:${API_PORT}/api`;
/** Tokens are signed with the same JWT_SECRET, so they are valid on both instances. */
const LOGIN_BASE = process.env.API_BASE_URL ?? "http://localhost:4000/api";
const PASSWORD = "SmartCampus@2026";
const STUDENT = { email: "aarav.sharma@smartcampus.edu", password: PASSWORD };
const FACULTY = { email: "ananya.sharma@smartcampus.edu", password: PASSWORD };
const ADMIN = { email: "admin@smartcampus.edu", password: PASSWORD };

/** The real model only has these classes; AVERAGE was never learned. */
const REAL_ML_URL = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8001";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function req(method, path, { body, token, timeoutMs = 15_000 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let json = null;
    const text = await response.text();
    try {
      json = JSON.parse(text);
    } catch {
      /* keep raw text for leak assertions */
    }
    return { status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function login(credentials) {
  // Authenticating against the long-running dev backend is enough: the test
  // instance shares JWT_SECRET, so the token authorises it too.
  const headers = { "Content-Type": "application/json" };
  const response = await fetch(`${LOGIN_BASE}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify(credentials),
  });
  const json = await response.json().catch(() => null);
  return json?.data?.token;
}

async function waitForHealth(timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Boots a backend on API_PORT with the given ML service URL. */
async function startBackend(mlServiceUrl, extraEnv = {}) {
  const child = spawn(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts"], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      ML_SERVICE_URL: mlServiceUrl,
      ML_TIMEOUT_MS: "1500",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  if (child.exitCode === null) child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const studentToken = await login(STUDENT);
  if (!studentToken) throw new Error("could not authenticate the demo student; seed the database first");

  // ---------------------------------------------------------------- real ML
  {
    const backend = await startBackend(REAL_ML_URL);
    try {
      const up = await waitForHealth();
      check("test backend started against the real ML service", up);
      if (!up) throw new Error("backend did not become healthy");

      const { status, json, text } = await req("GET", "/performance/predict", { token: studentToken });
      const p = json?.data;
      check("ML path returns 200", status === 200, `status=${status}`);
      check("prediction source is ML", p?.prediction_source === "ML", `source=${p?.prediction_source}`);
      check("model prediction is flagged", p?.is_model_prediction === true);
      check("no fallback reason on the ML path", p?.fallback_reason === undefined);
      check("model version is v1", p?.model_version === "v1", `version=${p?.model_version}`);
      check("category is a known band", ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"].includes(p?.category), `category=${p?.category}`);
      check("confidence within 0..1", typeof p?.confidence === "number" && p.confidence >= 0 && p.confidence <= 1, `confidence=${p?.confidence}`);
      check("probabilities sum to 1", Math.abs(Object.values(p?.probabilities ?? {}).reduce((a, b) => a + b, 0) - 1) < 1e-6, `probabilities=${JSON.stringify(p?.probabilities)}`);
      check("all 44 model features were used", p?.features_used?.length === 44, `features=${p?.features_used?.length}`);
      check("no fabricated AVERAGE class", !Object.keys(p?.probabilities ?? {}).includes("AVERAGE"), `classes=${JSON.stringify(Object.keys(p?.probabilities ?? {}))}`);
      check("no internal paths leaked to the client", !/\/app\/|\.joblib|Traceback|pipeline\.predict/i.test(text), "");

      const spoof = await req("GET", "/performance/predict?studentId=00000000-0000-0000-0000-000000000000", { token: studentToken });
      check("spoofed studentId is ignored", spoof.status === 200 && spoof.json?.data?.category === p?.category);
    } finally {
      await stopBackend(backend);
    }
  }

  // ------------------------------------------------------------- unreachable
  // Port 1 is reserved and refuses connections, so the backend sees a real
  // connection error rather than a simulated one.
  {
    const backend = await startBackend("http://127.0.0.1:1");
    try {
      const up = await waitForHealth();
      check("test backend started with an unreachable ML service", up);
      const started = Date.now();
      const { status, json, text } = await req("GET", "/performance/predict", { token: studentToken });
      const elapsed = Date.now() - started;
      const p = json?.data;
      check("unreachable ML still returns 200", status === 200, `status=${status}`);
      check("request does not hang", elapsed < 10_000, `elapsed=${elapsed}ms`);
      check("prediction source is RULE_BASED", p?.prediction_source === "RULE_BASED", `source=${p?.prediction_source}`);
      check("fallback is not flagged as a model prediction", p?.is_model_prediction === false);
      check("fallback reason is reported", typeof p?.fallback_reason === "string", `reason=${p?.fallback_reason}`);
      check("fallback version is not the model version", p?.model_version === "rule-based-v1", `version=${p?.model_version}`);
      check("no stack trace or network detail leaked", !/ECONNREFUSED|Traceback|127\.0\.0\.1:1|fetch failed/i.test(text), "");
    } finally {
      await stopBackend(backend);
    }
  }

  // ------------------------------------------------------------------ timeout
  {
    let received = 0;
    // Never responds: forces the backend's own ML_TIMEOUT_MS to fire.
    const slow = createServer((rq, rs) => {
      received += 1;
      void rq;
      void rs;
    });
    await new Promise((r) => slow.listen(0, "127.0.0.1", r));
    const slowPort = slow.address().port;

    const backend = await startBackend(`http://127.0.0.1:${slowPort}`);
    try {
      const up = await waitForHealth();
      check("test backend started with a hanging ML service", up);
      const started = Date.now();
      const { status, json } = await req("GET", "/performance/predict", { token: studentToken });
      const elapsed = Date.now() - started;
      const p = json?.data;
      check("hanging ML still returns 200", status === 200, `status=${status}`);
      check("ML request was actually attempted", received > 0, `calls=${received}`);
      check("timeout is enforced near ML_TIMEOUT_MS", elapsed < 8_000, `elapsed=${elapsed}ms`);
      check("timeout degrades to RULE_BASED", p?.prediction_source === "RULE_BASED", `source=${p?.prediction_source}`);
      check("timeout reason is ML_TIMEOUT", p?.fallback_reason === "ML_TIMEOUT", `reason=${p?.fallback_reason}`);
    } finally {
      await stopBackend(backend);
      await new Promise((r) => slow.close(r));
    }
  }

  // ------------------------------------------------- unhealthy / bad responses
  const badModes = [
    {
      name: "5xx",
      handler: (_rq, rs) => {
        rs.writeHead(500, { "Content-Type": "text/plain" });
        rs.end("Internal Server Error: /app/ml/models/performance_model.joblib missing");
      },
      expectReason: "ML_BAD_STATUS",
    },
    {
      name: "malformed body",
      handler: (_rq, rs) => {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end("{not json");
      },
      expectReason: "ML_INVALID_RESPONSE",
    },
    {
      name: "wrong shape",
      handler: (_rq, rs) => {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end(JSON.stringify({ unexpected: true, stack: "Traceback (most recent call last)" }));
      },
      expectReason: "ML_INVALID_RESPONSE",
    },
    {
      name: "degraded model",
      handler: (_rq, rs) => {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end(
          JSON.stringify({
            category: "GOOD",
            confidence: 0.5,
            probabilities: { GOOD: 0.5 },
            model_version: "v1",
            features_used: [],
            model_loaded: false,
          }),
        );
      },
      expectReason: "ML_INVALID_RESPONSE",
    },
    {
      name: "confidence out of range",
      handler: (_rq, rs) => {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end(
          JSON.stringify({
            category: "GOOD",
            confidence: 42,
            probabilities: { GOOD: 1 },
            model_version: "v1",
            features_used: [],
            model_loaded: true,
          }),
        );
      },
      expectReason: "ML_INVALID_RESPONSE",
    },
    {
      name: "category missing from probabilities",
      handler: (_rq, rs) => {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end(
          JSON.stringify({
            category: "EXCELLENT",
            confidence: 0.9,
            probabilities: { GOOD: 0.1 },
            model_version: "v1",
            features_used: [],
            model_loaded: true,
          }),
        );
      },
      expectReason: "ML_INVALID_RESPONSE",
    },
  ];

  for (const mode of badModes) {
    const stub = createServer((rq, rs) => {
      if (rq.url === "/predict" && rq.method === "POST") {
        let raw = "";
        rq.on("data", (c) => (raw += c));
        rq.on("end", () => mode.handler(rq, rs));
      } else {
        rs.writeHead(200, { "Content-Type": "application/json" });
        rs.end(JSON.stringify({ status: "healthy", model_loaded: true }));
      }
    });
    await new Promise((r) => stub.listen(0, "127.0.0.1", r));
    const stubPort = stub.address().port;

    const backend = await startBackend(`http://127.0.0.1:${stubPort}`);
    try {
      const up = await waitForHealth();
      check(`backend started for the "${mode.name}" ML response`, up);
      const { status, json, text } = await req("GET", "/performance/predict", { token: studentToken });
      const p = json?.data;
      check(`"${mode.name}": endpoint still answers 200`, status === 200, `status=${status}`);
      check(`"${mode.name}": degrades to RULE_BASED`, p?.prediction_source === "RULE_BASED", `source=${p?.prediction_source}`);
      check(`"${mode.name}": reason is ${mode.expectReason}`, p?.fallback_reason === mode.expectReason, `reason=${p?.fallback_reason}`);
      check(`"${mode.name}": no service internals leaked`, !/\.joblib|Traceback|\/app\/ml/i.test(text), "");
    } finally {
      await stopBackend(backend);
      await new Promise((r) => stub.close(r));
    }
  }

  // --------------------------------------------- authorization (ML path live)
  {
    const backend = await startBackend(REAL_ML_URL);
    try {
      const up = await waitForHealth();
      check("backend restarted for authorization checks", up);
      const anon = await req("GET", "/performance/predict");
      check("anonymous prediction is 401", anon.status === 401, `status=${anon.status}`);
      const facultyToken = await login(FACULTY);
      const adminToken = await login(ADMIN);
      const facultyRes = await req("GET", "/performance/predict", { token: facultyToken });
      check("faculty prediction is 403", facultyRes.status === 403, `status=${facultyRes.status}`);
      const adminRes = await req("GET", "/performance/predict", { token: adminToken });
      check("admin prediction is 403", adminRes.status === 403, `status=${adminRes.status}`);
    } finally {
      await stopBackend(backend);
    }
  }

  console.log("----------------------------------------");
  console.log(`PASSED: ${passed}   FAILED: ${failures.length}`);
  if (failures.length > 0) {
    failures.forEach((name) => console.log(`  - ${name}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("ML integration test crashed:", error);
  process.exit(1);
});
