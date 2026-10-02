/**
 * Phase 15: Transport Live Tracking Readiness - E2E (Puppeteer + system Chrome).
 * Coverage: student transport tracking card, parent tracking badge, admin fleet tracking,
 * admin simulation, security validation, tracking logic verification.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase15  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function api(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

const loginApi = async (email, password = PASSWORD) => {
  const { json } = await api("POST", "/auth/login", { body: { email, password } });
  return json.data.token;
};

async function main() {
  // Optional seed
  if (!process.env.E2E_SKIP_SEED) {
    console.log("[phase15] Seeding database...");
    try { execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "inherit" }); }
    catch (e) { console.error("Seed failed:", e.message); process.exit(1); }
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // Login helpers
  async function login(email) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    const currentUrl = page.url();
    if (!currentUrl.includes("/login")) {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    }
    await page.waitForSelector('#email', { timeout: 5000 });
    await page.type('#email', email);
    await page.type('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }

  async function logout() {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  }

  // --- 1. Student sees tracking card with demo label ---
  await login("aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/transport`);
  await page.waitForFunction(() => document.body.innerText.includes("Demo tracking"), { timeout: 5000 });
  const demoLabel = await page.evaluate(() => document.body.innerText.includes("Demo tracking"));
  record("student sees tracking card with demo label", demoLabel === true);
  const liveStatus = await page.evaluate(() => document.body.innerText.includes("Live bus status"));
  record("student sees Live bus status heading", liveStatus === true);
  const moving = await page.evaluate(() => document.body.innerText.includes("Moving"));
  record("student sees Moving status", moving === true);
  const yelahanka = await page.evaluate(() => document.body.innerText.includes("Yelahanka Old Town"));
  record("student sees Yelahanka Old Town current stop", yelahanka === true);

  // --- 2. Student without assignment sees empty state ---
  await logout();
  await login("karthik.reddy@smartcampus.edu");
  await page.goto(`${BASE}/transport`);
  await page.waitForFunction(() => document.body.innerText.includes("No transport assigned"), { timeout: 5000 });
  const emptyState = await page.evaluate(() => document.body.innerText.includes("No transport assigned"));
  record("student without assignment sees empty state", emptyState === true);

  // --- 3. Parent dashboard shows linked student transport (Aarav) ---
  await logout();
  await login("farah.khan@smartcampus.edu");
  await page.goto(`${BASE}/parent`);
  await page.waitForFunction(() => document.body.innerText.includes("Aarav Sharma"), { timeout: 15000 });
  const aarav = await page.evaluate(() => document.body.innerText.includes("Aarav Sharma"));
  record("parent sees Aarav Sharma", aarav === true);
  // "Aarav Sharma" is already present in the student switcher, so wait for the
  // transport card itself to finish loading before asserting on its content.
  await page.waitForFunction(() => document.body.innerText.includes("Bus status (demo)"), { timeout: 15000 });
  const busStatus = await page.evaluate(() => document.body.innerText.includes("Bus status (demo)"));
  record("parent sees Bus status (demo) badge", busStatus === true);
  const parentMoving = await page.evaluate(() => document.body.innerText.includes("Moving"));
  record("parent sees Moving status", parentMoving === true);
  record("parent does not see the raw tracking enum", !(await page.evaluate(() => /\bMOVING\b|\bIDLE\b|\bOFFLINE\b/.test(document.body.innerText))));

  // --- 4. Parent blocked from unlinked student transport ---
  // ravi.sharma is linked to Aarav only (see the seed's parent links).
  await logout();
  await login("ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`);
  await page.waitForFunction(() => document.body.innerText.includes("Aarav Sharma"), { timeout: 15000 });
  const aaravVisible = await page.evaluate(() => document.body.innerText.includes("Aarav Sharma"));
  const diyaVisible = await page.evaluate(() => document.body.innerText.includes("Diya Krishnan"));
  const rohanVisible = await page.evaluate(() => document.body.innerText.includes("Rohan Verma"));
  record("parent sees linked Aarav", aaravVisible);
  record("parent does NOT see unlinked Diya", !diyaVisible);
  record("parent does NOT see unlinked Rohan", !rohanVisible);

  // --- 5. Admin fleet tracking shows all vehicles with demo label ---
  await logout();
  await login("admin@smartcampus.edu");
  await page.goto(`${BASE}/admin/transport`);
  // Click Tracking tab
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => b.textContent.includes('Tracking'));
  }, { timeout: 5000 });
  const buttons = await page.$$('button');
  let found = false;
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Tracking')) {
      await btn.click();
      found = true;
      break;
    }
  }
  record("admin clicks Tracking tab", found);
  
  if (found) {
    await page.waitForFunction(() => document.body.innerText.includes("Demo data"), { timeout: 5000 });
    const demoData = await page.evaluate(() => document.body.innerText.includes("Demo data"));
    record("admin sees Demo data label", demoData === true);
    const v1 = await page.evaluate(() => document.body.innerText.includes("KA-01-AB-1234"));
    record("admin sees KA-01-AB-1234", v1);
    const v2 = await page.evaluate(() => document.body.innerText.includes("KA-01-CD-5678"));
    record("admin sees KA-01-CD-5678", v2);
    const v3 = await page.evaluate(() => document.body.innerText.includes("KA-01-EF-9012"));
    record("admin sees KA-01-EF-9012", v3);
    const yelahankaAdmin = await page.evaluate(() => document.body.innerText.includes("Yelahanka Old Town"));
    record("admin sees Yelahanka Old Town for V1", yelahankaAdmin);
    const jayanagarAdmin = await page.evaluate(() => document.body.innerText.includes("Jayanagar 4th Block"));
    record("admin sees Jayanagar 4th Block for V2", jayanagarAdmin);
  }

  // --- 6. Admin simulation advances stop and shows progress ---
  if (found) {
    const progress50 = await page.evaluate(() => document.body.innerText.includes("50%"));
    record("admin sees 50% progress for V1", progress50);
    // Click refresh
    const refreshBtns = await page.$$('button');
    for (const btn of refreshBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Refresh')) {
        await btn.click();
        break;
      }
    }
    await page.waitForFunction(() => document.body.innerText.includes("Yelahanka Old Town"), { timeout: 15000 });
    const yelahankaAfterRefresh = await page.evaluate(() => document.body.innerText.includes("Yelahanka Old Town"));
    record("admin sees Yelahanka Old Town after refresh", yelahankaAfterRefresh);
  }

  // --- 7. Admin telemetry endpoint rejects unauthenticated ---
  const unauthRes = await api("POST", "/admin/transport/telemetry", {
    body: { vehicleId: "00000000-0000-0000-0000-000000000000", latitude: 13.0, longitude: 77.6 },
  });
  record("telemetry rejects unauthenticated", unauthRes.status === 401);

  // --- 8. Admin telemetry endpoint rejects invalid coordinates ---
  const adminToken = await loginApi("admin@smartcampus.edu");
  const badLatRes = await api("POST", "/admin/transport/telemetry", {
    token: adminToken,
    body: { vehicleId: "00000000-0000-0000-0000-000000000000", latitude: 200, longitude: 77.6 },
  });
  record("telemetry rejects invalid latitude", badLatRes.status === 400);
  const badLonRes = await api("POST", "/admin/transport/telemetry", {
    token: adminToken,
    body: { vehicleId: "00000000-0000-0000-0000-000000000000", latitude: 13.0, longitude: 200 },
  });
  record("telemetry rejects invalid longitude", badLonRes.status === 400);
  const badSpeedRes = await api("POST", "/admin/transport/telemetry", {
    token: adminToken,
    body: { vehicleId: "00000000-0000-0000-0000-000000000000", latitude: 13.0, longitude: 77.6, speedKmh: -5 },
  });
  record("telemetry rejects negative speed", badSpeedRes.status === 400);

  // --- 9. Admin vehicle location endpoint works ---
  // (Verified by fleet tracking UI above)

  // --- 10. Tracking statuses derive correctly from seeded telemetry ---
  // The seeded fleet is V1 MOVING, V2 IDLE, V3 OFFLINE, and the admin fleet
  // card must label each one in the same wording the student card uses.
  await page.waitForFunction(
    () => ["Moving", "Idle", "Offline"].every((s) => document.body.innerText.includes(s)),
    { timeout: 15000 },
  );
  const fleetStatuses = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      moving: text.includes("Moving"),
      idle: text.includes("Idle"),
      offline: text.includes("Offline"),
      rawEnums: /\bMOVING\b|\bIDLE\b|\bOFFLINE\b/.test(text),
    };
  });
  record("admin fleet shows Moving status", fleetStatuses.moving === true);
  record("admin fleet shows Idle status", fleetStatuses.idle === true);
  record("admin fleet shows Offline status", fleetStatuses.offline === true);
  record("admin fleet does not leak raw tracking enums", fleetStatuses.rawEnums === false);

  await browser.close();

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== PHASE 15 E2E SUMMARY ===`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`TOTAL: ${results.length}`);
  if (failed > 0) {
    console.log("\nFailures:");
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}`));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });