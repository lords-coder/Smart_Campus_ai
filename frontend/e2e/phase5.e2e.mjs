/**
 * Phase 5: Performance Prediction - E2E (Puppeteer + system Chrome).
 * Coverage: prediction card on the student dashboard + the authenticated
 * `/api/performance` and `/api/performance/predict` endpoints (role scoping,
 * IDOR protection, prediction payload, model metadata).
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase5  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const API = "http://localhost:4000/api";
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "backend");
const PASSWORD = "SmartCampus@2026";

const STUDENT = "aarav.sharma@smartcampus.edu";
const OTHER_STUDENT = "diya.krishnan@smartcampus.edu";
const FACULTY = "ananya.sharma@smartcampus.edu";
const ADMIN = "admin@smartcampus.edu";

const CATEGORIES = ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"];
/**
 * Classes the shipped model can actually emit, read from the ML service rather
 * than hardcoded: the trained artifact never saw an AVERAGE example, so it has
 * three classes. Fetched once and used for the probability assertions.
 */
let MODEL_CLASSES = ["AT_RISK", "EXCELLENT", "GOOD"];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function api(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body is fine for status-only checks */
  }
  return { status: res.status, json };
}

const loginApi = async (email, password = PASSWORD) => {
  const { json } = await api("POST", "/auth/login", { body: { email, password } });
  return json?.data?.token;
};

async function main() {
  if (!process.env.E2E_SKIP_SEED) {
    console.log("[phase5] Seeding database...");
    try {
      execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "inherit" });
    } catch (e) {
      console.error("Seed failed:", e.message);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------- API layer

  // Read the model's real class list so the assertions below describe the
  // model that is actually deployed, not an assumed four-band taxonomy.
  // When the ML service is intentionally down this is informational only.
  const mlExpectedUp = (process.env.E2E_ML_EXPECTED_SOURCE ?? "ML") === "ML";
  const mlUrl = (process.env.ML_SERVICE_URL ?? "http://localhost:8001").replace(/\/+$/, "");
  try {
    const health = await fetch(`${mlUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (health.ok) {
      const body = await health.json();
      if (Array.isArray(body.classes) && body.classes.length > 0) {
        MODEL_CLASSES = body.classes;
      }
    }
    if (mlExpectedUp) {
      record("model class list read from the ML service", true, `classes=${MODEL_CLASSES.join(",")}`);
    }
  } catch {
    if (mlExpectedUp) {
      record("model class list read from the ML service", false, "ML service unreachable");
    }
  }

  const studentToken = await loginApi(STUDENT);
  const otherToken = await loginApi(OTHER_STUDENT);
  const facultyToken = await loginApi(FACULTY);
  const adminToken = await loginApi(ADMIN);
  record("demo accounts can authenticate", Boolean(studentToken && otherToken && facultyToken && adminToken));

  // --- 1. Prediction endpoint returns a full, well-formed prediction ---
  const predict = await api("GET", "/performance/predict", { token: studentToken });
  const p = predict.json?.data;
  record("GET /performance/predict returns 200", predict.status === 200, `status=${predict.status}`);
  record(
    "prediction category is a valid band",
    CATEGORIES.includes(p?.category),
    `category=${p?.category}`,
  );
  record(
    "confidence is a 0..1 number",
    typeof p?.confidence === "number" && p.confidence >= 0 && p.confidence <= 1,
    `confidence=${p?.confidence}`,
  );
  record(
    "confidence equals the top probability",
    Math.abs(Math.max(...Object.values(p?.probabilities ?? { 0: 0 })) - (p?.confidence ?? -1)) < 1e-9,
  );

  // --- 1b. The prediction comes from the Python ML service ---
  const mlLive = process.env.E2E_ML_EXPECTED_SOURCE ?? "ML";
  record(
    `prediction source is ${mlLive} (ML service ${mlLive === "ML" ? "reachable" : "expected down"})`,
    p?.prediction_source === mlLive,
    `source=${p?.prediction_source}`,
  );
  record(
    "is_model_prediction agrees with the source",
    p?.is_model_prediction === (mlLive === "ML"),
    `is_model_prediction=${p?.is_model_prediction}`,
  );
  if (mlLive === "ML") {
    record(
      "probabilities cover the classes the model actually declares",
      // The shipped model never learned AVERAGE, so it must not appear here.
      // Asserting the full four-band set would be wrong; see MODEL_CLASSES.
      MODEL_CLASSES.every((c) => typeof p?.probabilities?.[c] === "number") &&
        Object.keys(p?.probabilities ?? {}).every((c) => MODEL_CLASSES.includes(c)),
      `probabilities=${JSON.stringify(p?.probabilities)}`,
    );
    record("model version metadata is reported", p?.model_version === "v1", `model_version=${p?.model_version}`);
    record("an ML prediction uses all 44 model features", p?.features_used?.length === 44, `features=${p?.features_used?.length}`);
    record("ML prediction carries a training timestamp", Boolean(p?.model_trained_at), `trained_at=${p?.model_trained_at}`);
    record("ML prediction carries an inference timestamp", Boolean(p?.predicted_at), `predicted_at=${p?.predicted_at}`);
    record(
      "probabilities never invent a class the model lacks",
      !Object.keys(p?.probabilities ?? {}).includes("AVERAGE"),
      `classes=${JSON.stringify(Object.keys(p?.probabilities ?? {}))}`,
    );
    record(
      "the predicted category appears in its own probability map",
      Object.prototype.hasOwnProperty.call(p?.probabilities ?? {}, p?.category),
    );
  } else {
    // The rule-based path defines all four bands by threshold, so all four may
    // legitimately appear here — that is the point of the marker.
    record(
      "rule-based probabilities cover the four threshold bands",
      CATEGORIES.every((c) => typeof p?.probabilities?.[c] === "number"),
      `probabilities=${JSON.stringify(p?.probabilities)}`,
    );
    record("a rule-based prediction is not flagged as a model prediction", p?.is_model_prediction === false);
    record("a rule-based prediction reports why", typeof p?.fallback_reason === "string", `reason=${p?.fallback_reason}`);
    record("a rule-based prediction is not versioned as the model", p?.model_version === "rule-based-v1", `version=${p?.model_version}`);
    record(
      "a rule-based prediction does not claim the full model feature set",
      (p?.features_used?.length ?? 0) < 44,
      `features=${p?.features_used?.length}`,
    );
  }

  // --- 2. Feature endpoint returns the inputs behind the prediction ---
  const features = await api("GET", "/performance", { token: studentToken });
  const f = features.json?.data;
  record("GET /performance returns 200", features.status === 200, `status=${features.status}`);
  record("features expose attendance_percentage", typeof f?.attendance_percentage === "number", `attendance=${f?.attendance_percentage}`);
  record("features expose academic_score", typeof f?.academic_score === "number", `academic_score=${f?.academic_score}`);
  record(
    "features stay within 0..100",
    f?.attendance_percentage >= 0 && f?.attendance_percentage <= 100 && f?.academic_score >= 0 && f?.academic_score <= 100,
  );

  // --- 3. Cross-student protection: identity comes from the JWT only ---
  const spoof = await api("GET", `/performance/predict?studentId=${encodeURIComponent("00000000-0000-0000-0000-000000000000")}`, {
    token: studentToken,
  });
  record(
    "a supplied studentId cannot change the prediction target",
    spoof.status === 200 && spoof.json?.data?.category === p?.category && spoof.json?.data?.confidence === p?.confidence,
  );
  const otherPredict = await api("GET", "/performance/predict", { token: otherToken });
  const otherFeatures = await api("GET", "/performance", { token: otherToken });
  record(
    "each student sees only their own features",
    otherFeatures.status === 200 &&
      otherFeatures.json?.data?.attendance_percentage !== f?.attendance_percentage,
    `other=${otherFeatures.json?.data?.attendance_percentage} vs ${f?.attendance_percentage}`,
  );
  record("other student still gets a valid prediction", CATEGORIES.includes(otherPredict.json?.data?.category));

  // --- 4. Role scoping ---
  for (const [label, token] of [
    ["faculty", facultyToken],
    ["admin", adminToken],
  ]) {
    const rp = await api("GET", "/performance/predict", { token });
    const rf = await api("GET", "/performance", { token });
    record(`${label} is blocked from /performance/predict`, rp.status === 403, `status=${rp.status}`);
    record(`${label} is blocked from /performance`, rf.status === 403, `status=${rf.status}`);
  }

  for (const endpoint of ["/performance/predict", "/performance"]) {
    const anon = await api("GET", endpoint);
    record(`unauthenticated is blocked from ${endpoint}`, anon.status === 401, `status=${anon.status}`);
  }

  // ------------------------------------------------------------- Browser layer

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  async function login(email) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    if (!page.url().includes("/login")) {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    }
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.type("#email", email);
    await page.type("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }

  async function logout() {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  }

  // --- 5. The dashboard card renders the live prediction, not a placeholder ---
  // The integrated Command Center presents the prediction on its "Academic
  // outlook" card. The assertion is unchanged - the category shown must be the
  // category the API returned - only the label it is read from.
  await login(STUDENT);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    (cats) => {
      const text = document.body.innerText;
      return text.includes("Academic outlook") && cats.some((c) => text.includes(c));
    },
    { timeout: 20000 },
    CATEGORIES,
  );
  const card = await page.evaluate(() => {
    const text = document.body.innerText;
    const category = ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"].find((c) => text.includes(c)) ?? null;
    const confidence = text.match(/[Mm]odel confidence:\s*(\d+)%/)?.[1] ?? text.match(/Confidence:\s*(\d+)%/)?.[1] ?? null;
    return {
      category,
      confidence,
      hasPlaceholder: text.includes("No prediction"),
      showsMlSource: text.includes("ML model"),
      showsRuleSource: text.includes("Rule-based fallback"),
      showsVersion: /ML model\s*·\s*v\d+/.test(text),
      showsFallbackNotice: text.includes("not a model prediction"),
      leaksInternals: /ML_UNREACHABLE|ML_TIMEOUT|ML_BAD_STATUS|ML_INVALID_RESPONSE|ECONNREFUSED|Traceback|\/api\/performance\/predict/.test(
        text,
      ),
    };
  });
  record("dashboard renders the Performance prediction card", card.category !== null, `category=${card.category}`);
  record("dashboard shows a confidence percentage", card.confidence !== null, `confidence=${card.confidence}%`);
  record("dashboard no longer shows the 'No prediction' placeholder", !card.hasPlaceholder);
  record(
    "dashboard card agrees with the API prediction",
    card.category === p?.category,
    `ui=${card.category} api=${p?.category}`,
  );
  record("dashboard shows no raw backend or network error", !card.leaksInternals);

  if (mlLive === "ML") {
    record("dashboard names the ML model as the source", card.showsMlSource);
    record("dashboard shows the model version", card.showsVersion, `expected "ML model · ${p?.model_version}"`);
    record("dashboard does not claim a rule-based fallback", !card.showsRuleSource);
  } else {
    record("dashboard names the rule-based fallback", card.showsRuleSource);
    record("dashboard explains the fallback is not a model prediction", card.showsFallbackNotice);
    record("dashboard does not claim an ML model", !card.showsMlSource);
  }

  // --- 6. The dashboard does not leak another student's numbers ---
  const dashboardText = await page.evaluate(() => document.body.innerText);
  const otherName = await api("GET", "/students/me", { token: otherToken });
  record(
    "dashboard shows no other student identifier",
    !dashboardText.includes(otherName.json?.data?.studentNo ?? "SC2025-002"),
  );

  // --- 7. Anonymous visitors are bounced off the student dashboard ---
  await logout();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15000 });
  record("anonymous dashboard visit redirects to /login", page.url().includes("/login"), `url=${page.url()}`);

  // --- 8. Non-student roles never see the student dashboard ---
  for (const [label, email] of [
    ["admin", ADMIN],
    ["faculty", FACULTY],
  ]) {
    await login(email);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => !location.pathname.startsWith("/dashboard"), { timeout: 15000 });
    const body = await page.evaluate(() => document.body.innerText);
    record(
      `${label} is redirected away from the student dashboard`,
      !page.url().includes("/dashboard"),
      `url=${page.url()}`,
    );
    record(`${label} never sees the prediction card`, !body.includes("Performance prediction"));
    await logout();
  }

  // --- 9. A student cannot reach another student's prediction ---
  const otherProfile = await api("GET", "/students/me", { token: otherToken });
  const otherProfileId = otherProfile.json?.data?.id;
  record("a second student has a resolvable profile", Boolean(otherProfileId), `id=${otherProfileId}`);

  // The prediction endpoint takes no studentId, so the only way to try to
  // redirect it is the query string — which the backend must ignore.
  for (const [label, target] of [
    ["zero uuid", "00000000-0000-0000-0000-000000000000"],
    ["other student's profile id", otherProfileId],
    ["another student's profile id", "00000000-0000-0000-0000-000000000001"],
  ]) {
    if (!target) continue;
    const spoofed = await api("GET", `/performance/predict?studentId=${encodeURIComponent(target)}`, {
      token: studentToken,
    });
    record(
      `a supplied studentId (${label}) cannot redirect the prediction`,
      spoofed.status === 200 &&
        spoofed.json?.data?.category === p?.category &&
        spoofed.json?.data?.confidence === p?.confidence,
      `spoofed=${spoofed.json?.data?.category} own=${p?.category}`,
    );
  }

  const otherOwn = await api("GET", "/performance/predict", { token: otherToken });
  record(
    "each student receives their own prediction",
    otherOwn.status === 200 &&
      otherOwn.json?.data?.prediction_source === p?.prediction_source &&
      (mlLive === "ML"
        ? otherOwn.json?.data?.features_used?.length === 44
        : (otherOwn.json?.data?.features_used?.length ?? 0) < 44),
    `source=${otherOwn.json?.data?.prediction_source}`,
  );

  // The features endpoint must not become a cross-student read either.
  const otherFeaturesScoped = await api("GET", "/performance", { token: otherToken });
  const ownFeaturesScoped = await api("GET", "/performance", { token: studentToken });
  record(
    "the features view is scoped to the caller",
    otherFeaturesScoped.status === 200 &&
      otherFeaturesScoped.json?.data?.attendance_percentage !== ownFeaturesScoped.json?.data?.attendance_percentage,
    `other=${otherFeaturesScoped.json?.data?.attendance_percentage} own=${ownFeaturesScoped.json?.data?.attendance_percentage}`,
  );

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== PHASE 5 E2E SUMMARY ===`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`TOTAL: ${results.length}`);
  if (failed > 0) {
    console.log("\nFailures:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
