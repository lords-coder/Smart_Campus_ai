/**
 * Phase 10 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: student certificate requests (create, pending, issued list,
 * view/download/verify actions), admin review (filter, approve, issue,
 * revoke), parent read-only visibility, public verification
 * (VALID / REVOKED / NOT FOUND), and role/IDOR guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase10  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const bodyText = (page) => page.evaluate(() => document.body.innerText);

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
    /* ignore */
  }
  return { status: res.status, json };
}

const loginApi = async (email, password = PASSWORD) => {
  const { json } = await api("POST", "/auth/login", { body: { email, password } });
  return json.data.token;
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForFunction(() => location.pathname !== "/login", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function waitFor(page, fn, timeout = 20000, ...args) {
  try {
    await page.waitForFunction(fn, { timeout }, ...args);
    return true;
  } catch {
    return false;
  }
}

async function clickButtonByText(page, text) {
  return page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === t);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, text);
}

async function fillInput(page, selector, value) {
  await page.$eval(
    selector,
    (el, next) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "textarea") {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(el, next);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, next);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    value,
  );
}

(async () => {
  if (process.env.E2E_SKIP_SEED !== "1") {
    console.log("[seed] resetting demo data...");
    execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "ignore" });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // =====================================================================
  // 1. STUDENT - request a certificate, see seeded issued certificate
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("student nav links to certificates", studentNav.some((l) => l === "Certificates"), JSON.stringify(studentNav));

  await page.goto(`${BASE}/certificates`, { waitUntil: "networkidle2" });
  const certLoaded = await waitFor(page, () => document.body.innerText.includes("SC-2026-BON-000001"), 20000);
  let text = await bodyText(page);
  record("student sees seeded issued certificate", certLoaded);
  record("issued certificate has view/download/verify actions", text.includes("Download") && text.includes("Verify"));

  await clickButtonByText(page, "Request certificate");
  const dialogShown = await waitFor(page, () => document.querySelector("#cert-purpose") !== null, 15000);
  record("request dialog opens", dialogShown);
  if (dialogShown) {
    await page.select("#cert-type", "ENROLLMENT");
    await fillInput(page, "#cert-purpose", "E2E request: passport application supporting document.");
    await page.evaluate(() => {
      const form = document.querySelector("#cert-purpose")?.closest("form");
      if (form) form.requestSubmit();
    });
    const submitted = await waitFor(page, () => document.body.innerText.includes("E2E request"), 20000);
    record("request appears as pending", submitted);
  }

  // =====================================================================
  // 2. ADMIN - review, approve, issue
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to certificates", adminNav.some((l) => l === "Certificates"), JSON.stringify(adminNav));

  await page.goto(`${BASE}/admin/certificates`, { waitUntil: "networkidle2" });
  const adminLoaded = await waitFor(page, () => document.body.innerText.includes("SC-2025-001") || document.body.innerText.includes("Aarav Sharma"), 20000);
  record("admin certificate queue loads", adminLoaded);

  await clickButtonByText(page, "PENDING");
  const opened = await (async () => {
    const ready = await waitFor(
      page,
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => (b.textContent || "").includes("Aarav Sharma") && (b.textContent || "").includes("ENROLLMENT"),
        ),
      20000,
    );
    if (!ready) return false;
    return page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => (b.textContent || "").includes("Aarav Sharma") && (b.textContent || "").includes("ENROLLMENT"),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
  })();
  record("admin opens the E2E request", opened);

  const approved = await (async () => {
    if (!opened) return false;
    const btnReady = await waitFor(page, () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Approve"), 15000);
    if (!btnReady) return false;
    await clickButtonByText(page, "Approve");
    // "APPROVED" is also a status-filter button label, so waiting for that text
    // can succeed before the detail panel has refetched. Wait for the panel to
    // actually advance to the next action instead.
    return waitFor(page, () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Issue certificate"), 20000);
  })();
  record("admin approves the request", approved);

  const issued = await (async () => {
    if (!approved) return false;
    await clickButtonByText(page, "Issue certificate");
    return waitFor(
      page,
      () => document.body.innerText.includes("ISSUED") && !document.body.innerText.includes("Issue certificate"),
      20000,
    );
  })();
  record("admin issues the certificate", issued);

  // =====================================================================
  // 3. PARENT - read-only visibility, no admin controls
  // =====================================================================
  await login(page, "ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const parentCerts = await waitFor(page, () => document.body.innerText.includes("SC-2026-BON-000001"), 25000);
  record("parent sees linked issued certificate", parentCerts);

  await page.goto(`${BASE}/admin/certificates`, { waitUntil: "networkidle2" });
  const parentBlocked = await waitFor(page, () => location.pathname !== "/admin/certificates", 15000);
  record("parent is bounced from certificate management", parentBlocked, page.url());

  // =====================================================================
  // 4. STUDENT is bounced from admin certificate management
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/admin/certificates`, { waitUntil: "networkidle2" });
  const studentBlocked = await waitFor(page, () => location.pathname !== "/admin/certificates", 15000);
  record("student is bounced from certificate management", studentBlocked, page.url());

  // =====================================================================
  // 5. PUBLIC VERIFICATION (no login)
  // =====================================================================
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());

  await page.goto(`${BASE}/verify/DEMO-BONAFIDE-AARAV-01`, { waitUntil: "networkidle2" });
  const validShown = await waitFor(page, () => document.body.innerText.includes("Certificate Verified"), 20000);
  text = await bodyText(page);
  record("public verification shows VALID", validShown);
  record("public page shows certificate number", text.includes("SC-2026-BON-000001"));

  await page.goto(`${BASE}/verify/DEMO-ENROLL-KARTHIK-02`, { waitUntil: "networkidle2" });
  const revokedShown = await waitFor(page, () => document.body.innerText.includes("Certificate Revoked"), 20000);
  record("public verification shows REVOKED", revokedShown);

  await page.goto(`${BASE}/verify/NOPE-NOT-REAL-0000`, { waitUntil: "networkidle2" });
  const missingShown = await waitFor(page, () => document.body.innerText.includes("Certificate Not Found"), 20000);
  record("public verification shows NOT FOUND", missingShown);

  // =====================================================================
  // 6. API - auth, transitions, IDOR, revoke-then-verify
  // =====================================================================
  const anonList = await api("GET", "/certificates/requests");
  record("certificate API requires authentication", anonList.status === 401, `status=${anonList.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const diyaTok = await loginApi("diya.krishnan@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");

  const facultyBlocked = await api("GET", "/certificates/requests", { token: facultyTok });
  record("faculty has no certificate access", facultyBlocked.status === 403, `status=${facultyBlocked.status}`);

  // The UI flow approved+issued Aarav's ENROLLMENT; create a fresh CONDUCT
  // request for transition tests (Aarav has no pending CONDUCT... unless the
  // smoke suite left one — E2E seeds first, so the slate is clean).
  const fresh = await api("POST", "/certificates/requests", {
    token: studentTok,
    body: { certificateType: "CONDUCT", purpose: "E2E API: conduct certificate for verification." },
  });
  record("API creates request", fresh.status === 201, `status=${fresh.status}`);
  const freshId = fresh.json?.data?.id;

  const dupPending = await api("POST", "/certificates/requests", {
    token: studentTok,
    body: { certificateType: "CONDUCT", purpose: "Duplicate attempt while pending." },
  });
  record("API duplicate pending is prevented", dupPending.status === 409, `status=${dupPending.status}`);

  if (freshId) {
    const badIssue = await api("POST", `/admin/certificates/requests/${freshId}/issue`, { token: adminTok });
    record("API cannot issue unapproved request", badIssue.status === 400, `status=${badIssue.status}`);

    await api("PATCH", `/admin/certificates/requests/${freshId}/approve`, { token: adminTok });
    const issuedRes = await api("POST", `/admin/certificates/requests/${freshId}/issue`, { token: adminTok });
    const code = issuedRes.json?.data?.certificate?.verificationCode;
    record(
      "API issues with unique number and code",
      issuedRes.status === 201 && /^SC-\d{4}-[A-Z]{3}-\d{6}$/.test(issuedRes.json?.data?.certificate?.certificateNumber ?? ""),
      `number=${issuedRes.json?.data?.certificate?.certificateNumber}`,
    );

    if (code) {
      const verifyFresh = await api("GET", `/certificates/verify/${code}`);
      record("fresh certificate verifies VALID", verifyFresh.status === 200 && verifyFresh.json?.data?.status === "VALID", `status=${verifyFresh.status}`);

      const certId = issuedRes.json?.data?.certificate?.id;
      await api("PATCH", `/admin/certificates/${certId}/revoke`, { token: adminTok });
      const verifyRevoked = await api("GET", `/certificates/verify/${code}`);
      record("revoked certificate verifies REVOKED", verifyRevoked.status === 200 && verifyRevoked.json?.data?.status === "REVOKED", `status=${verifyRevoked.status}`);

      const diyaForge = await api("GET", `/certificates/${certId}`, { token: diyaTok });
      record("cross-student certificate read is blocked", diyaForge.status === 404, `status=${diyaForge.status}`);
    } else {
      record("API issues with unique number and code", false, "no code returned");
      record("fresh certificate verifies VALID", false, "skipped");
      record("revoked certificate verifies REVOKED", false, "skipped");
      record("cross-student certificate read is blocked", false, "skipped");
    }
  } else {
    record("API creates request", false, "create failed, skipping transition tests");
    record("API duplicate pending is prevented", false, "skipped");
    record("API cannot issue unapproved request", false, "skipped");
    record("API issues with unique number and code", false, "skipped");
    record("fresh certificate verifies VALID", false, "skipped");
    record("revoked certificate verifies REVOKED", false, "skipped");
    record("cross-student certificate read is blocked", false, "skipped");
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P10 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
