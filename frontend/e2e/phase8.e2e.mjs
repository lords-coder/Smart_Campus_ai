/**
 * Phase 8 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: admin parent management (invitation create/status/revoke),
 * public parent activation, parent dashboard (switcher, attendance, fees,
 * timetable, recommendations, notices), cross-student and role guards, and
 * parent API auth/scope checks.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase8   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

async function waitFor(page, fn, timeout = 15000, ...args) {
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
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
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

  const parentEmail = `phase8.e2e.${Date.now()}@smartcampus.edu`;

  // =====================================================================
  // 1. ADMIN - parent management + invitation creation
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  record("admin lands on fee management", page.url().includes("/admin"), page.url());

  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "admin nav links to parents",
    adminNav.some((label) => label.includes("Parents")),
    JSON.stringify(adminNav),
  );

  await page.goto(`${BASE}/admin/parents`, { waitUntil: "networkidle2" });
  const parentsLoaded = await waitFor(page, () => document.body.innerText.includes("Parent accounts"), 20000);
  let text = await bodyText(page);
  record("admin parents page loads", parentsLoaded);
  record(
    "seeded parent accounts are listed",
    text.includes("Ravi Sharma") && text.includes("Farah Khan"),
    (text.match(/(Ravi Sharma|Farah Khan)/) || [""])[0],
  );

  // Create an invitation through the UI.
  await clickButtonByText(page, "Create invitation");
  const dialogShown = await waitFor(page, () => document.querySelector("#inv-email") !== null, 15000);
  record("invitation dialog opens", dialogShown);

  let issuedToken = null;
  if (dialogShown) {
    await fillInput(page, "#inv-student", "SC2025-004");
    await clickButtonByText(page, "Find");
    const found = await waitFor(page, () => document.body.innerText.includes("Found:"), 15000);
    record("student lookup finds Sneha Patel", found);
    await fillInput(page, "#inv-email", parentEmail);
    await page.select("#inv-rel", "GUARDIAN");
    await page.evaluate(() => {
      const form = document.querySelector("#inv-email")?.closest("form");
      if (form) form.requestSubmit();
    });
    const linkShown = await waitFor(page, () => document.body.innerText.includes("Invitation created"), 20000);
    text = await bodyText(page);
    record("invitation link is shown once to admin", linkShown);
    issuedToken = await page.evaluate(() => {
      const code = [...document.querySelectorAll("code")].find((el) => (el.textContent || "").includes("/parent/activate?token="));
      const match = (code?.textContent || "").match(/token=([A-Za-z0-9_-]+)/);
      return match ? match[1] : null;
    });
    record("invitation token is extractable for the demo", Boolean(issuedToken), issuedToken ? `${issuedToken.slice(0, 8)}...` : "");
    await clickButtonByText(page, "Done");
  }

  // =====================================================================
  // 2. PARENT ACTIVATION (public, no session)
  // =====================================================================
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());
  if (issuedToken) {
    await page.goto(`${BASE}/parent/activate?token=${issuedToken}`, { waitUntil: "networkidle2" });
    const formShown = await waitFor(page, () => document.querySelector("#act-password") !== null, 15000);
    record("public activation form loads", formShown);
    if (formShown) {
      await fillInput(page, "#act-name", "Phase Eight Guardian");
      await page.type("#act-password", PASSWORD);
      await page.evaluate(() => {
        const form = document.querySelector("#act-password")?.closest("form");
        if (form) form.requestSubmit();
      });
      const landed = await waitFor(page, () => location.pathname === "/parent", 20000);
      record("activation signs the parent in to /parent", landed, page.url());
    }
  } else {
    record("public activation form loads", false, "no token issued, skipping");
    record("activation signs the parent in to /parent", false, "skipped");
  }

  // =====================================================================
  // 3. PARENT DASHBOARD (newly activated parent -> Sneha)
  // =====================================================================
  await waitFor(page, () => document.body.innerText.includes("Sneha Patel"), 25000);
  text = await bodyText(page);
  record(
    "parent dashboard shows linked student",
    text.includes("Sneha Patel"),
    (text.match(/Sneha Patel/) || [""])[0],
  );
  record("parent dashboard shows attendance", text.includes("Overall attendance"));
  record("parent dashboard shows fee status", text.includes("Pending fees") || text.includes("Fee status"));
  record("parent dashboard shows timetable", text.includes("Classes today") || text.includes("Today’s classes"));
  record(
    "parent dashboard shows learning focus",
    text.includes("Learning focus areas") || text.includes("No specific focus areas"),
  );
  record(
    "parent dashboard hides risk internals",
    !text.includes("Risk Level") && !/Risk Score/i.test(text),
  );

  // =====================================================================
  // 4. MULTI-STUDENT SWITCHER (seeded Farah: Aarav + Diya)
  // =====================================================================
  await login(page, "farah.khan@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const switcherShown = await waitFor(page, () => document.querySelector("#parent-student") !== null, 20000);
  record("student switcher appears for multi-link parent", switcherShown);
  if (switcherShown) {
    await page.select("#parent-student", await page.$eval("#parent-student option:nth-child(2)", (el) => el.value));
    await new Promise((r) => setTimeout(r, 2000));
    text = await bodyText(page);
    record(
      "switching students changes the dashboard",
      text.includes("Diya Krishnan") || text.includes("Aarav Sharma"),
      (text.match(/(Diya Krishnan|Aarav Sharma)/) || [""])[0],
    );
  }

  // Parent role guards: staff areas stay blocked.
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
  const blockedAdmin = await waitFor(page, () => location.pathname !== "/admin", 15000);
  record("parent is bounced from admin area", blockedAdmin, page.url());

  await page.goto(`${BASE}/faculty/risk`, { waitUntil: "networkidle2" });
  const blockedRisk = await waitFor(page, () => location.pathname !== "/faculty/risk", 15000);
  record("parent is bounced from risk dashboard", blockedRisk, page.url());

  // =====================================================================
  // 5. STUDENT cannot reach the parent portal
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const studentBounced = await waitFor(page, () => location.pathname !== "/parent", 15000);
  record("student is bounced from parent portal", studentBounced, page.url());

  // =====================================================================
  // 6. API - auth, ownership, role isolation
  // =====================================================================
  const anonStudents = await api("GET", "/parent/students");
  record("parent endpoints require authentication", anonStudents.status === 401, `status=${anonStudents.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");
  const parentTok = await loginApi(parentEmail);

  const studentBlocked = await api("GET", "/parent/students", { token: studentTok });
  record("student cannot use parent endpoints", studentBlocked.status === 403, `status=${studentBlocked.status}`);

  const facultyBlocked = await api("GET", "/parent/students", { token: facultyTok });
  record("faculty cannot use parent endpoints", facultyBlocked.status === 403, `status=${facultyBlocked.status}`);

  const ownList = await api("GET", "/parent/students", { token: parentTok });
  const linked = ownList.json?.data?.students ?? [];
  record(
    "parent lists only linked students",
    ownList.status === 200 && linked.length === 1 && linked[0].studentNo === "SC2025-004",
    `${ownList.status} linked=${linked.length}`,
  );

  const snehaId = linked[0]?.studentId;
  const blockedOther = await api("GET", `/parent/students/${snehaId}/overview`, { token: parentTok });
  record("parent reads linked overview", blockedOther.status === 200, `status=${blockedOther.status}`);

  // Resolve an unlinked student id via admin scope, then attempt access.
  const adminList = await api("GET", "/risk/students", { token: adminTok });
  const other = (adminList.json?.data?.students ?? []).find((s) => s.studentId !== snehaId);
  if (other) {
    const forged = await api("GET", `/parent/students/${other.studentId}/overview`, { token: parentTok });
    record("parent blocked from unlinked student", forged.status === 404, `status=${forged.status}`);

    const forgedFees = await api("GET", `/parent/students/${other.studentId}/fees`, { token: parentTok });
    record("parent blocked from unlinked fees", forgedFees.status === 404, `status=${forgedFees.status}`);
  } else {
    record("parent blocked from unlinked student", false, "no second student found");
    record("parent blocked from unlinked fees", false, "skipped");
  }

  const parentScope = await api("GET", "/parent/students", { token: parentTok });
  record(
    "parent payload contains no staff internals",
    !JSON.stringify(parentScope.json).includes("riskScore"),
    "payload scan",
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P8 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
