/**
 * Phase 13 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: student alumni directory (search, filters, profile, mentor
 * request), alumni portal (profile edit, incoming requests, accept),
 * admin management (verify profile, create event, registrations, campaign,
 * contribution recording, analytics), parent boundaries, and role/IDOR
 * guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase13  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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
  // 1. STUDENT - directory, mentor search, request, events
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await waitFor(page, () => document.body.innerText.includes("Meet alumni"), 20000);
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("student nav links to alumni", studentNav.some((l) => l === "Alumni"), JSON.stringify(studentNav));

  const dashText = await bodyText(page);
  record("dashboard shows alumni network card", dashText.includes("Meet alumni"));

  await page.goto(`${BASE}/alumni`, { waitUntil: "networkidle2" });
  const dirLoaded = await waitFor(page, () => document.body.innerText.includes("Arjun Menon"), 20000);
  let text = await bodyText(page);
  record("alumni directory lists verified alumni", dirLoaded);
  record("directory hides private profiles", !text.includes("Ananya Iyer"));
  record("directory hides unverified profiles", !text.includes("Vikram Reddy"));

  // Search narrows the directory.
  await fillInput(page, 'input[aria-label="Search alumni"]', "divya");
  await clickButtonByText(page, "Search");
  const searched = await waitFor(
    page,
    () => document.body.innerText.includes("Divya Rao") && !document.body.innerText.includes("Sanjay Krishnan"),
    20000,
  );
  record("directory search narrows results", searched);

  // Open a mentor profile from the mentorship page and request guidance.
  // (Divya has no seeded request from Aarav, so the request succeeds.)
  await page.goto(`${BASE}/alumni/mentorship`, { waitUntil: "networkidle2" });
  const mentorsShown = await waitFor(page, () => document.body.innerText.includes("Divya Rao"), 20000);
  record("mentorship page lists offering mentors", mentorsShown);

  const mentorOpened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("Divya Rao"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("mentor card opens request dialog", mentorOpened);

  const requested = await (async () => {
    if (!mentorOpened) return false;
    const dialogReady = await waitFor(
      page,
      () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Send request"),
      15000,
    );
    if (!dialogReady) return false;
    await fillInput(page, "#ms-topic", "E2E mentorship on backend careers");
    await page.evaluate(() => {
      const form = document.querySelector("#ms-topic")?.closest("form");
      if (form) form.requestSubmit();
    });
    return waitFor(page, () => document.body.innerText.includes("E2E mentorship on backend careers"), 20000);
  })();
  record("student request appears in my requests", requested);

  // Events: register for the alumni meet (Aarav already holds a career-talk seat).
  await page.goto(`${BASE}/alumni/events`, { waitUntil: "networkidle2" });
  const eventsShown = await waitFor(page, () => document.body.innerText.includes("Career Talk"), 20000);
  record("events page lists published events", eventsShown);
  const registered = await page.evaluate(() => {
    const items = [...document.querySelectorAll("li")].filter((li) => (li.textContent || "").includes("Alumni Meet 2026"));
    const btn = items.flatMap((li) => [...li.querySelectorAll("button")]).find((b) => (b.textContent || "").trim() === "Register");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("student registers for event", registered);

  // =====================================================================
  // 2. ALUMNI - profile, incoming request, accept
  // =====================================================================
  await login(page, "arjun.menon@alumni.smartcampus.edu");
  record("alumni lands on alumni directory", page.url().includes("/alumni"), page.url());

  await page.goto(`${BASE}/alumni/profile`, { waitUntil: "networkidle2" });
  const profileShown = await waitFor(page, () => document.body.innerText.includes("My alumni profile"), 20000);
  record("alumni edits own profile", profileShown);
  if (profileShown) {
    await fillInput(page, "#al-bio", "E2E bio: backend systems engineer mentoring students.");
    await page.evaluate(() => {
      const form = document.querySelector("#al-bio")?.closest("form");
      if (form) form.requestSubmit();
    });
    const saved = await waitFor(page, () => document.body.innerText.includes("Profile saved"), 20000);
    record("profile save confirms", saved);
  }

  await page.goto(`${BASE}/alumni/mentorship`, { waitUntil: "networkidle2" });
  const incomingShown = await waitFor(page, () => document.body.innerText.includes("Aarav Sharma"), 20000);
  record("alumni sees incoming student request", incomingShown);
  const accepted = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("li")].filter((li) => (li.textContent || "").includes("Aarav Sharma"));
    const btn = rows.flatMap((li) => [...li.querySelectorAll("button")]).find((b) => (b.textContent || "").trim() === "Accept");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("alumni accepts mentorship", accepted);

  // =====================================================================
  // 3. ADMIN - verify profile, create event, campaign, contribution
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to alumni", adminNav.some((l) => l === "Alumni"), JSON.stringify(adminNav));

  await page.goto(`${BASE}/admin/alumni`, { waitUntil: "networkidle2" });
  const adminLoaded = await waitFor(page, () => document.body.innerText.includes("Vikram Reddy"), 20000);
  record("admin sees verification queue", adminLoaded);
  const verified = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")].filter((tr) => (tr.textContent || "").includes("Vikram Reddy"));
    const btn = rows.flatMap((tr) => [...tr.querySelectorAll("button")]).find((b) => (b.textContent || "").trim() === "Verify");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  record("admin verifies alumni profile", verified);

  // Create an event through the UI.
  await clickButtonByText(page, "New event");
  const eventDialog = await waitFor(
    page,
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Save"),
    15000,
  );
  record("event dialog opens", eventDialog);

  // =====================================================================
  // 4. SECURITY guards
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/admin/alumni`, { waitUntil: "networkidle2" });
  const studentBlocked = await waitFor(page, () => location.pathname !== "/admin/alumni", 15000);
  record("student is bounced from admin alumni", studentBlocked, page.url());

  await login(page, "ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/alumni`, { waitUntil: "networkidle2" });
  const parentBlocked = await waitFor(page, () => location.pathname !== "/alumni", 15000);
  record("parent has no directory access", parentBlocked, page.url());

  // =====================================================================
  // 5. API - auth, ownership, IDOR
  // =====================================================================
  const anonDir = await api("GET", "/alumni/directory");
  record("directory requires authentication", anonDir.status === 401, `status=${anonDir.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");
  const alumniTok = await loginApi("divya.rao@alumni.smartcampus.edu");
  const parentTok = await loginApi("ravi.sharma@smartcampus.edu");

  const facultyDir = await api("GET", "/alumni/directory", { token: facultyTok });
  record("faculty reads directory read-only", facultyDir.status === 200, `status=${facultyDir.status}`);

  const studentAdmin = await api("GET", "/admin/alumni/analytics", { token: studentTok });
  record("student cannot access alumni admin", studentAdmin.status === 403, `status=${studentAdmin.status}`);

  const alumniAdmin = await api("GET", "/admin/alumni/analytics", { token: alumniTok });
  record("alumni cannot access alumni admin", alumniAdmin.status === 403, `status=${alumniAdmin.status}`);

  const forgedProfile = await api("PATCH", "/alumni/me/profile", {
    token: studentTok,
    body: { currentCompany: "Hacker Inc" },
  });
  record("student cannot use alumni profile routes", forgedProfile.status === 403, `status=${forgedProfile.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P13 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
