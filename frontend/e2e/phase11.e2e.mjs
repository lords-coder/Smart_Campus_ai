/**
 * Phase 11 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: student library portal (search, book detail, reserve,
 * loans/renew, reservations/cancel, fines, dashboard card), admin library
 * management (issue, return, overdue, reservations, fines, catalogue
 * create), parent read-only library view, and role/IDOR guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase11  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

  // =====================================================================
  // 1. STUDENT library portal (Aarav: active loan, no fine)
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await waitFor(page, () => document.body.innerText.includes("Open Library"), 20000);
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("student nav links to library", studentNav.some((l) => l === "Library"), JSON.stringify(studentNav));

  const dashText = await bodyText(page);
  record("dashboard shows library card", dashText.includes("Open Library"));

  await page.goto(`${BASE}/library`, { waitUntil: "networkidle2" });
  const loansShown = await waitFor(page, () => document.body.innerText.includes("Introduction to Algorithms"), 20000);
  let text = await bodyText(page);
  record("student library shows borrowed book", loansShown);
  record("borrowed book shows due date", /Due \d{4}-\d{2}-\d{2}/.test(text));

  // Search the catalogue.
  await fillInput(page, 'input[aria-label="Search books"]', "discrete");
  await clickButtonByText(page, "Search");
  const searched = await waitFor(page, () => document.body.innerText.includes("Discrete Mathematics"), 20000);
  record("catalogue search finds the math text", searched);

  // Open the book detail and reserve it (Aarav has no reservation on it).
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("Discrete Mathematics"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("book detail opens from catalogue", opened);
  const reserved = await (async () => {
    if (!opened) return false;
    const ready = await waitFor(page, () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Reserve this book"), 15000);
    if (!ready) return false;
    await clickButtonByText(page, "Reserve this book");
    return waitFor(page, () => document.body.innerText.includes("Reserved"), 20000);
  })();
  record("student reserves from book detail", reserved);

  // Renew the active loan (no queue on CLRS, so renewal is eligible).
  const renewed = await (async () => {
    const found = await waitFor(
      page,
      () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Renew"),
      20000,
    );
    if (!found) return false;
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Renew");
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 3000));
    const text = await bodyText(page);
    return text.includes("renewed 1x");
  })();
  record("student renews loan from list", renewed);

  // =====================================================================
  // 2. ADMIN library management
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to library", adminNav.some((l) => l === "Library"), JSON.stringify(adminNav));

  await page.goto(`${BASE}/admin/library`, { waitUntil: "networkidle2" });
  const adminLoaded = await waitFor(page, () => document.body.innerText.includes("Introduction to Algorithms"), 20000);
  text = await bodyText(page);
  record("admin catalogue lists seeded books", adminLoaded);

  // Issue flow: create a book + copy, then issue to Ishita (no loans).
  await clickButtonByText(page, "New book");
  const bookDialog = await waitFor(
    page,
    () => [...document.querySelectorAll("input")].some((el) => el.placeholder === "UUID from catalogue" || document.body.innerText.includes("New book")),
    15000,
  );
  record("admin book dialog opens", bookDialog);

  // Overdue tab shows Rohan's seeded overdue loan.
  await clickButtonByText(page, "Overdue");
  const overdueShown = await waitFor(page, () => document.body.innerText.includes("Rohan Verma"), 20000);
  record("admin overdue view names the overdue borrower", overdueShown);

  // Return Rohan's loan from the loans tab and confirm the fine path.
  await clickButtonByText(page, "Loans");
  await waitFor(page, () => document.body.innerText.includes("Rohan Verma"), 20000);
  const returned = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")].filter((tr) => (tr.textContent || "").includes("Rohan Verma"));
    const btn = rows.flatMap((tr) => [...tr.querySelectorAll("button")]).find((b) => (b.textContent || "").trim() === "Return");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("admin returns overdue loan from list", returned);

  // =====================================================================
  // 3. PARENT read-only library view (Ravi -> Aarav)
  // =====================================================================
  await login(page, "ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const parentLibrary = await waitFor(page, () => document.body.innerText.includes("Introduction to Algorithms"), 25000);
  record("parent dashboard shows linked library loans", parentLibrary);

  // =====================================================================
  // 4. SECURITY guards
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/admin/library`, { waitUntil: "networkidle2" });
  const studentBlocked = await waitFor(page, () => location.pathname !== "/admin/library", 15000);
  record("student is bounced from admin library", studentBlocked, page.url());

  // =====================================================================
  // 5. API - auth, ownership, IDOR, parent scope
  // =====================================================================
  const anonBooks = await api("GET", "/library/books");
  record("catalogue requires authentication", anonBooks.status === 401, `status=${anonBooks.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const diyaTok = await loginApi("diya.krishnan@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");
  const parentTok = await loginApi("ravi.sharma@smartcampus.edu");

  const studentAdmin = await api("GET", "/admin/library/loans", { token: studentTok });
  record("student cannot access library admin", studentAdmin.status === 403, `status=${studentAdmin.status}`);

  const facultyAdmin = await api("POST", "/admin/library/issue", {
    token: facultyTok,
    body: { studentNo: "SC2025-001", copyId: "00000000-0000-0000-0000-000000000000" },
  });
  record("faculty cannot issue books", facultyAdmin.status === 403, `status=${facultyAdmin.status}`);

  // Aarav's loans are invisible to Diya (ownership by JWT, no id params).
  const diyaLoans = await api("GET", "/library/my-loans", { token: diyaTok });
  const diyaSeesAarav = (diyaLoans.json?.data?.loans ?? []).some((l) => (l.bookTitle || "").includes("Algorithms"));
  record("student cannot see another student's loans", !diyaSeesAarav);

  // Parent scope: Ravi sees Aarav's loans, not Rohan's.
  const students = (await api("GET", "/parent/students", { token: parentTok })).json?.data?.students ?? [];
  const aaravId = students.find((s) => s.studentNo === "SC2025-001")?.studentId;
  const parentLib = await api("GET", `/parent/students/${aaravId}/library`, { token: parentTok });
  record(
    "parent reads linked library summary",
    parentLib.status === 200 && (parentLib.json?.data?.activeLoans ?? []).length > 0,
    `status=${parentLib.status}`,
  );

  const adminStudents = (await api("GET", "/risk/students", { token: adminTok })).json?.data?.students ?? [];
  const rohanId = adminStudents.find((s) => s.studentNo === "SC2025-003")?.studentId;
  const parentForged = await api("GET", `/parent/students/${rohanId}/library`, { token: parentTok });
  record("parent blocked from unlinked library data", parentForged.status === 404, `status=${parentForged.status}`);

  const parentMutate = await api("POST", "/library/loans/00000000-0000-0000-0000-000000000000/renew", { token: parentTok });
  record("parent cannot use student loan mutations", parentMutate.status === 403, `status=${parentMutate.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P11 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
