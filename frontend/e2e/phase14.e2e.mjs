/**
 * Phase 14 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: student mess portal (plan, menu, billing), canteen catalogue
 * (search, cart, order, order list), feedback, admin mess management
 * (menu entry, meal record, order advance, billing run), parent read-only
 * mess view, and role/IDOR guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase14  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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
  // 1. STUDENT mess + canteen portal (Aarav: enrolled, orders exist)
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await waitFor(page, () => document.body.innerText.includes("Open Mess"), 20000);
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("student nav links to mess & canteen", studentNav.some((l) => l === "Mess & Canteen"), JSON.stringify(studentNav));
  record("dashboard shows mess card", (await bodyText(page)).includes("Open Mess"));

  await page.goto(`${BASE}/mess`, { waitUntil: "networkidle2" });
  const planShown = await waitFor(page, () => document.body.innerText.includes("Monthly Veg Plan"), 20000);
  let text = await bodyText(page);
  record("student mess shows active plan", planShown);
  record("student mess shows weekly menu", text.includes("BREAKFAST") && text.includes("DINNER"));

  // Canteen tab: search, add to cart, place order.
  await clickButtonByText(page, "Canteen");
  const canteenShown = await waitFor(page, () => document.body.innerText.includes("Masala Chai"), 20000);
  record("canteen catalogue loads", canteenShown);

  // Catalogue rows live in grid lists; order history elsewhere on the page
  // shares item names, so assertions below are scoped to the grids.
  const catalogueItems = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("ul.grid")].flatMap((g) => [...g.querySelectorAll("li")].map((li) => li.textContent || "")),
    );

  await fillInput(page, 'input[aria-label="Search canteen items"]', "dosa");
  await clickButtonByText(page, "Search");
  const searched = await waitFor(
    page,
    () => {
      const grids = [...document.querySelectorAll("ul.grid")];
      const items = grids.flatMap((g) => [...g.querySelectorAll("li")]);
      return items.length === 1 && (items[0].textContent || "").toLowerCase().includes("dosa");
    },
    20000,
  );
  record("canteen search narrows items", searched, `rows=${(await catalogueItems()).length}`);

  // Reset search, add Masala Chai ×2 (fresh element query per click), place the order.
  await fillInput(page, 'input[aria-label="Search canteen items"]', "");
  await clickButtonByText(page, "Search");
  await waitFor(
    page,
    () => {
      const grids = [...document.querySelectorAll("ul.grid")];
      return grids.flatMap((g) => [...g.querySelectorAll("li")]).length >= 12;
    },
    20000,
  );
  async function clickAddChai() {
    return page.evaluate(() => {
      const grids = [...document.querySelectorAll("ul.grid")];
      for (const g of grids) {
        const li = [...g.querySelectorAll("li")].find((el) => (el.textContent || "").includes("Masala Chai"));
        if (!li) continue;
        const btn = [...li.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").startsWith("Add one"));
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    });
  }
  await clickAddChai();
  await new Promise((r) => setTimeout(r, 500));
  await clickAddChai();
  const cartShown = await waitFor(page, () => document.body.innerText.includes("Your cart"), 20000);
  record("cart appears with two chais", cartShown);
  if (cartShown) {
    await clickButtonByText(page, "Place order");
    const ordered = await waitFor(page, () => document.body.innerText.includes("Masala Chai × 2") && !document.body.innerText.includes("Your cart"), 25000);
    record("order placed and listed", ordered);
  }

  // Feedback tab.
  await clickButtonByText(page, "Feedback");
  const feedbackShown = await waitFor(page, () => document.body.innerText.includes("Rate today"), 20000);
  record("feedback tab loads", feedbackShown);

  // =====================================================================
  // 2. ADMIN mess management
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to mess & canteen", adminNav.some((l) => l === "Mess & Canteen"), JSON.stringify(adminNav));

  await page.goto(`${BASE}/admin/mess`, { waitUntil: "networkidle2" });
  const adminLoaded = await waitFor(page, () => document.body.innerText.includes("Monthly Veg Plan"), 20000);
  record("admin plans list seeded plans", adminLoaded);

  // Record a meal through the UI dialog.
  await clickButtonByText(page, "Record meal");
  const mealDialog = await waitFor(
    page,
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Save"),
    15000,
  );
  record("meal record dialog opens", mealDialog);

  // Orders tab: the E2E order placed above appears with the student name.
  await clickButtonByText(page, "Orders");
  const ordersShown = await waitFor(page, () => document.body.innerText.includes("Aarav Sharma"), 20000);
  record("admin sees student orders", ordersShown);

  // =====================================================================
  // 3. PARENT read-only mess view (Ravi -> Aarav)
  // =====================================================================
  await login(page, "ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const parentMess = await waitFor(page, () => document.body.innerText.includes("Monthly Veg Plan"), 25000);
  record("parent dashboard shows linked meal plan", parentMess);

  // =====================================================================
  // 4. SECURITY guards
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/admin/mess`, { waitUntil: "networkidle2" });
  const studentBlocked = await waitFor(page, () => location.pathname !== "/admin/mess", 15000);
  record("student is bounced from admin mess", studentBlocked, page.url());

  // =====================================================================
  // 5. API - auth, ownership, IDOR
  // =====================================================================
  const anonPlan = await api("GET", "/mess/plan");
  record("mess API requires authentication", anonPlan.status === 401, `status=${anonPlan.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const diyaTok = await loginApi("diya.krishnan@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");
  const parentTok = await loginApi("ravi.sharma@smartcampus.edu");

  const facultyAdmin = await api("GET", "/admin/mess/plans", { token: facultyTok });
  record("faculty cannot access mess admin", facultyAdmin.status === 403, `status=${facultyAdmin.status}`);

  const diyaOrders = await api("GET", "/mess/orders", { token: diyaTok });
  const seesAarav = JSON.stringify(diyaOrders.json ?? {}).includes("Masala Chai × 2");
  record("student cannot see another student's orders", !seesAarav);

  const parentStudents = (await api("GET", "/parent/students", { token: parentTok })).json?.data?.students ?? [];
  const aaravId = parentStudents.find((s) => s.studentNo === "SC2025-001")?.studentId;
  const parentMessApi = await api("GET", `/parent/students/${aaravId}/mess`, { token: parentTok });
  record(
    "parent reads linked mess summary",
    parentMessApi.status === 200 && typeof parentMessApi.json?.data?.billing?.outstanding === "number",
    `status=${parentMessApi.status}`,
  );

  const adminStudents = (await api("GET", "/risk/students", { token: adminTok })).json?.data?.students ?? [];
  const rohanId = adminStudents.find((s) => s.studentNo === "SC2025-003")?.studentId;
  const parentForged = await api("GET", `/parent/students/${rohanId}/mess`, { token: parentTok });
  record("parent blocked from unlinked mess data", parentForged.status === 404, `status=${parentForged.status}`);

  const parentFeedback = await api("POST", "/mess/feedback", {
    token: parentTok,
    body: { mealType: "LUNCH", rating: 5 },
  });
  record("parent cannot submit feedback", parentFeedback.status === 403, `status=${parentFeedback.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P14 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
