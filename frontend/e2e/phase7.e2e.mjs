/**
 * Phase 7 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: faculty/admin risk dashboards (list, filters, stats, trends,
 * evidence, intervention create/update), student scoping (no staff dashboard,
 * own analysis only), API auth/validation/IDOR guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase7   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const loginApi = async (email) => {
  const { json } = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
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

async function clickEl(page, selector) {
  return page.$eval(selector, (el) => {
    if (!el || el.disabled) return false;
    el.click();
    return true;
  });
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
  // 1. FACULTY - risk dashboard, filters, detail, intervention create
  // =====================================================================
  await login(page, "ananya.sharma@smartcampus.edu");
  record("faculty lands on attendance management", page.url().includes("/faculty"), page.url());

  const facultyNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "faculty nav links to risk indicators",
    facultyNav.some((label) => label.includes("Risk")),
    JSON.stringify(facultyNav),
  );

  await page.goto(`${BASE}/faculty/risk`, { waitUntil: "networkidle2" });
  const riskLoaded = await waitFor(page, () => document.querySelector("#risk-table") !== null, 20000);
  let text = await bodyText(page);
  record("faculty risk dashboard loads with table", riskLoaded, text.slice(0, 80).replace(/\n/g, " "));
  record(
    "dashboard shows monitoring disclaimer",
    text.includes("early-warning") || text.includes("Review recommended"),
    text.slice(0, 120).replace(/\n/g, " "),
  );
  record(
    "risk list names students in scope",
    text.includes("Karthik Reddy") || text.includes("Rohan Verma"),
    (text.match(/(Karthik Reddy|Rohan Verma|Aarav Sharma)/) || [""])[0],
  );

  // Filter to HIGH+CRITICAL only — LOW students should disappear.
  const filterClicked = await clickEl(page, '[data-testid="risk-filter-high"]');
  await new Promise((r) => setTimeout(r, 1500));
  text = await bodyText(page);
  const highVisible = text.includes("Karthik Reddy") || text.includes("Rohan Verma") || text.includes("Sneha Patel");
  record("high filter keeps at-risk students", filterClicked && highVisible);
  const lowHidden = !text.includes("Ishita Banerjee");
  record("high filter hides low-risk students", lowHidden, lowHidden ? "" : "Ishita still listed");

  // Reset to all, then open a student detail page.
  await clickEl(page, '[data-testid="risk-filter-all"]');
  await new Promise((r) => setTimeout(r, 1500));
  const detailHref = await page.evaluate(() => {
    const link = document.querySelector('#risk-table a[href*="/faculty/risk/"]');
    return link ? link.getAttribute("href") : null;
  });
  record("risk table links to student detail", Boolean(detailHref), detailHref ?? "");

  if (detailHref) {
    await page.goto(`${BASE}${detailHref}`, { waitUntil: "networkidle2" });
    const trendsShown = await waitFor(page, () => document.body.innerText.includes("Attendance trend"), 20000);
    text = await bodyText(page);
    record("student detail shows trend cards", trendsShown);
    record(
      "student detail shows evidence",
      text.includes("Evidence") && (text.includes("decline") || text.includes("stable") || text.includes("No warning")),
      (text.match(/Evidence[^.]{0,80}/) || [""])[0].replace(/\n/g, " ").slice(0, 90),
    );

    // Create an intervention through the UI.
    const dialogOpened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("Create intervention"));
      if (btn) { btn.click(); return true; }
      return false;
    });
    const dialogShown = await waitFor(page, () => document.querySelector("#iv-notes") !== null, 15000);
    record("intervention dialog opens", dialogOpened && dialogShown);

    if (dialogShown) {
      await page.type("#iv-notes", "E2E check-in: reviewed trends with student, agreed attendance plan.");
      await page.evaluate(() => {
        const notes = document.querySelector("#iv-notes");
        const form = notes ? notes.closest("form") : null;
        if (form) form.requestSubmit();
      });
      const saved = await waitFor(page, () => document.body.innerText.includes("E2E check-in"), 20000);
      text = await bodyText(page);
      record("created intervention appears in history", saved, saved ? "" : text.slice(0, 100).replace(/\n/g, " "));
    }
  }

  // =====================================================================
  // 2. ADMIN - cohort overview, detail, intervention update
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  record("admin lands on fee management", page.url().includes("/admin"), page.url());

  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "admin nav links to risk overview",
    adminNav.some((label) => label.includes("Risk")),
    JSON.stringify(adminNav),
  );

  await page.goto(`${BASE}/admin/risk`, { waitUntil: "networkidle2" });
  const adminLoaded = await waitFor(page, () => document.querySelector("#risk-stats") !== null, 20000);
  text = await bodyText(page);
  record("admin risk overview loads cohort summary", adminLoaded);
  record(
    "cohort summary counts students in scope",
    /Total students in scope: \d+/.test(text),
    (text.match(/Total students in scope: \d+/) || [""])[0],
  );

  const adminDetailHref = await page.evaluate(() => {
    const link = document.querySelector('#risk-table a[href*="/admin/risk/"]');
    return link ? link.getAttribute("href") : null;
  });
  if (adminDetailHref) {
    await page.goto(`${BASE}${adminDetailHref}`, { waitUntil: "networkidle2" });
    const adminDetail = await waitFor(page, () => document.body.innerText.includes("Interventions"), 20000);
    record("admin can open student risk detail", adminDetail, adminDetailHref);
  } else {
    record("admin can open student risk detail", false, "no detail link");
  }

  // =====================================================================
  // 3. STUDENT - no staff dashboard, own analysis only
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "student nav has no staff risk dashboard",
    !studentNav.some((label) => label.includes("Risk")),
    JSON.stringify(studentNav),
  );

  await page.goto(`${BASE}/faculty/risk`, { waitUntil: "networkidle2" });
  const bouncedFaculty = await waitFor(page, () => location.pathname !== "/faculty/risk", 15000);
  record("student is bounced from faculty risk route", bouncedFaculty, page.url());

  await page.goto(`${BASE}/admin/risk`, { waitUntil: "networkidle2" });
  const bouncedAdmin = await waitFor(page, () => location.pathname !== "/admin/risk", 15000);
  record("student is bounced from admin risk route", bouncedAdmin, page.url());

  // =====================================================================
  // 4. API - auth, validation, IDOR guards
  // =====================================================================
  const anonStats = await api("GET", "/risk/stats");
  record("risk stats require authentication", anonStats.status === 401, `status=${anonStats.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");

  const studentList = await api("GET", "/risk/students", { token: studentTok });
  record("student cannot read staff risk list", studentList.status === 403, `status=${studentList.status}`);

  const facultyList = await api("GET", "/risk/students", { token: facultyTok });
  const facultyStudents = facultyList.json?.data?.students ?? [];
  record(
    "faculty reads scoped risk list",
    facultyList.status === 200 && Array.isArray(facultyStudents) && facultyStudents.length > 0,
    `${facultyList.status} students=${facultyStudents.length}`,
  );
  record(
    "risk records carry level, score and signals",
    facultyStudents.every((s) => typeof s.riskScore === "number" && Array.isArray(s.signals) && typeof s.riskLevel === "string"),
    JSON.stringify(facultyStudents.slice(0, 1).map((s) => ({ level: s.riskLevel, score: s.riskScore }))),
  );

  const forgedSection = await api("GET", "/risk/students?section=Z9", { token: facultyTok });
  record(
    "crafted section filter returns empty, not other data",
    forgedSection.status === 200 && (forgedSection.json?.data?.students ?? []).length === 0,
    `students=${(forgedSection.json?.data?.students ?? []).length}`,
  );

  const unknownStudent = await api("GET", "/risk/students/00000000-0000-0000-0000-000000000000", { token: facultyTok });
  record(
    "unknown student id is rejected",
    unknownStudent.status === 403 || unknownStudent.status === 404,
    `status=${unknownStudent.status}`,
  );

  const studentDetail = await api("GET", "/risk/students/00000000-0000-0000-0000-000000000000", { token: studentTok });
  record("student cannot read staff risk detail", studentDetail.status === 403, `status=${studentDetail.status}`);

  const ownAnalysis = await api("GET", "/risk/own/analysis", { token: studentTok });
  const ownData = ownAnalysis.json?.data ?? {};
  record(
    "student reads own risk analysis",
    ownAnalysis.status === 200 && typeof ownData.riskLevel === "string" && Array.isArray(ownData.signals),
    `${ownAnalysis.status} level=${ownData.riskLevel}`,
  );
  record(
    "own analysis exposes no staff notes or other students",
    ownData.interventions === undefined && ownData.created_by === undefined,
    Object.keys(ownData).join(","),
  );

  const badType = await api("POST", `/risk/students/${facultyStudents[0]?.studentId}/interventions`, {
    token: facultyTok,
    body: { interventionType: "DETENTION", notes: "x" },
  });
  record("invalid intervention type is rejected", badType.status === 400, `status=${badType.status}`);

  const badDate = await api("POST", `/risk/students/${facultyStudents[0]?.studentId}/interventions`, {
    token: facultyTok,
    body: { interventionType: "ACADEMIC_REVIEW", notes: "x", followUpDate: "not-a-date" },
  });
  record("invalid follow-up date is rejected", badDate.status === 400, `status=${badDate.status}`);

  const created = await api("POST", `/risk/students/${facultyStudents[0]?.studentId}/interventions`, {
    token: adminTok,
    body: { interventionType: "ACADEMIC_REVIEW", notes: "API E2E review", followUpDate: "2026-11-01" },
  });
  record(
    "admin creates an intervention",
    created.status === 201 && Boolean(created.json?.data?.id),
    `${created.status} id=${created.json?.data?.id ?? "none"}`,
  );

  const ivId = created.json?.data?.id;
  if (ivId) {
    const badStatus = await api("PATCH", `/risk/interventions/${ivId}`, {
      token: adminTok,
      body: { status: "ARCHIVED" },
    });
    record("invalid intervention status is rejected", badStatus.status === 400, `status=${badStatus.status}`);

    const updated = await api("PATCH", `/risk/interventions/${ivId}`, {
      token: facultyTok,
      body: { status: "IN_PROGRESS", notes: "API E2E follow-up" },
    });
    record(
      "faculty updates intervention in scope",
      updated.status === 200 && updated.json?.data?.status === "IN_PROGRESS",
      `${updated.status} status=${updated.json?.data?.status}`,
    );

    const studentPatch = await api("PATCH", `/risk/interventions/${ivId}`, {
      token: studentTok,
      body: { status: "COMPLETED" },
    });
    record("student cannot modify interventions", studentPatch.status === 403, `status=${studentPatch.status}`);
  } else {
    record("invalid intervention status is rejected", false, "create failed, skipping");
    record("faculty updates intervention in scope", false, "create failed, skipping");
    record("student cannot modify interventions", false, "create failed, skipping");
  }

  const anonCreate = await api("POST", "/risk/interventions", {
    body: { studentId: facultyStudents[0]?.studentId, interventionType: "ACADEMIC_REVIEW" },
  });
  record("intervention creation requires authentication", anonCreate.status === 401, `status=${anonCreate.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P7 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
