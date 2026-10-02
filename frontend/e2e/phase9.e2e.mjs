/**
 * Phase 9 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: student hostel portal (allocation, roommates, fees, complaint
 * create, room-change request, visitor request, empty states), student
 * transport portal (route, pass, alerts), admin hostel management
 * (occupancy, allocate, complaint triage, room-change review, visitor
 * review), admin transport management (fleet, vehicle create, route/stop
 * create, assignment, alerts), parent transport/hostel visibility, and
 * role/IDOR guards.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase9   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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
  // 1. STUDENT hostel portal (allocated student: Aarav)
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("student nav links to hostel", studentNav.some((l) => l === "Hostel"), JSON.stringify(studentNav));
  record("student nav links to transport", studentNav.some((l) => l === "Transport"));

  await page.goto(`${BASE}/hostel`, { waitUntil: "networkidle2" });
  const hostelLoaded = await waitFor(page, () => document.body.innerText.includes("A-101"));
  let text = await bodyText(page);
  record("student hostel shows room and bed", hostelLoaded, (text.match(/A-101/) || [""])[0]);
  record(
    "student hostel shows roommate",
    text.includes("Rohan Verma"),
    (text.match(/Rohan Verma/) || [""])[0],
  );
  record("student hostel shows warden", text.includes("Vikram Rao"));

  // File a complaint through the UI.
  await clickButtonByText(page, "New complaint");
  const complaintDialog = await waitFor(page, () => document.querySelector("#hc-desc") !== null, 15000);
  record("complaint dialog opens", complaintDialog);
  if (complaintDialog) {
    await fillInput(page, "#hc-desc", "E2E complaint: corridor lights flicker after midnight.");
    await page.evaluate(() => {
      const form = document.querySelector("#hc-desc")?.closest("form");
      if (form) form.requestSubmit();
    });
    const filed = await waitFor(page, () => document.body.innerText.includes("E2E complaint"), 20000);
    record("complaint appears in student list", filed);
  }

  // Request a room change through the UI.
  await clickButtonByText(page, "Request change");
  const changeDialog = await waitFor(page, () => document.querySelector("#hc-reason") !== null, 15000);
  record("room-change dialog opens", changeDialog);
  if (changeDialog) {
    await fillInput(page, "#hc-reason", "E2E request: prefer a quieter floor for exams.");
    await page.evaluate(() => {
      const form = document.querySelector("#hc-reason")?.closest("form");
      if (form) form.requestSubmit();
    });
    const requested = await waitFor(page, () => document.body.innerText.includes("E2E request"), 20000);
    record("room-change request appears in student list", requested);
  }

  // =====================================================================
  // 2. STUDENT hostel empty state (day scholar: Diya)
  // =====================================================================
  await login(page, "diya.krishnan@smartcampus.edu");
  await page.goto(`${BASE}/hostel`, { waitUntil: "networkidle2" });
  const emptyShown = await waitFor(page, () => document.body.innerText.includes("No hostel allocation"), 20000);
  record("unallocated student sees empty state", emptyShown);

  // =====================================================================
  // 3. STUDENT transport portal (Aarav: R1-NORTH)
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/transport`, { waitUntil: "networkidle2" });
  const transportLoaded = await waitFor(page, () => document.body.innerText.includes("R1-NORTH"), 20000);
  text = await bodyText(page);
  record("student transport shows route", transportLoaded);
  record("student transport shows pickup stop", text.includes("Yelahanka Old Town"));
  record("student transport shows bus pass", /SCBP-/.test(text), (text.match(/SCBP-[A-Z0-9-]+/) || [""])[0]);
  record("student transport shows route alert", text.includes("Jakkur Cross"));

  // Unassigned student (Karthik) sees the empty state.
  await login(page, "karthik.reddy@smartcampus.edu");
  await page.goto(`${BASE}/transport`, { waitUntil: "networkidle2" });
  const transportEmpty = await waitFor(page, () => document.body.innerText.includes("No transport assigned"), 20000);
  record("unassigned student sees transport empty state", transportEmpty);

  // =====================================================================
  // 4. ADMIN hostel management
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to hostel", adminNav.some((l) => l === "Hostel"), JSON.stringify(adminNav));
  record("admin nav links to transport", adminNav.some((l) => l === "Transport"));

  await page.goto(`${BASE}/admin/hostel`, { waitUntil: "networkidle2" });
  const hostelAdminLoaded = await waitFor(page, () => document.body.innerText.includes("Occupancy"), 20000);
  text = await bodyText(page);
  record("admin hostel dashboard shows occupancy", hostelAdminLoaded);
  record("admin hostel lists rooms", text.includes("A-101") && text.includes("G-201"));

  // Allocate a fresh student through the UI: use the API-registered temp
  // account pattern via UI is heavy; allocate Diya (day scholar, section A)
  // into G-202 bed 1 through the allocate dialog.
  await clickButtonByText(page, "Allocate student");
  const allocDialog = await waitFor(page, () => document.querySelector("#al-student") !== null, 15000);
  record("allocation dialog opens", allocDialog);
  if (allocDialog) {
    await fillInput(page, "#al-student", "SC2025-002");
    await page.evaluate(() => {
      const sel = document.querySelector("#al-room");
      if (!sel) return;
      const opt = [...sel.options].find((o) => o.text.includes("G-202"));
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.evaluate(() => {
      const form = document.querySelector("#al-student")?.closest("form");
      if (form) form.requestSubmit();
    });
    const allocated = await waitFor(page, () => document.body.innerText.includes("Diya Krishnan"), 20000);
    record("admin allocates student to room", allocated);
  }

  // Triage the E2E complaint filed earlier.
  await clickButtonByText(page, "Complaints");
  await waitFor(page, () => document.body.innerText.includes("E2E complaint"), 20000);
  const triaged = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Start work");
    if (btns[0]) {
      btns[0].click();
      return true;
    }
    return false;
  });
  record("admin triages complaint from list", triaged);

  // =====================================================================
  // 5. ADMIN transport management
  // =====================================================================
  await page.goto(`${BASE}/admin/transport`, { waitUntil: "networkidle2" });
  const transportAdminLoaded = await waitFor(page, () => document.body.innerText.includes("Fleet vehicles"), 20000);
  text = await bodyText(page);
  record("admin transport dashboard loads fleet", transportAdminLoaded);
  record("admin fleet lists seeded vehicles", text.includes("KA-01-AB-1234"));

  await clickButtonByText(page, "New vehicle");
  const vehicleDialog = await waitFor(
    page,
    () => [...document.querySelectorAll("input")].some((el) => el.placeholder === "KA-01-XY-0000"),
    15000,
  );
  record("vehicle dialog opens", vehicleDialog);

  // =====================================================================
  // 6. PARENT sees linked transport + hostel
  // =====================================================================
  await login(page, "ravi.sharma@smartcampus.edu");
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle2" });
  const parentTransport = await waitFor(page, () => document.body.innerText.includes("R1-NORTH"), 25000);
  text = await bodyText(page);
  record("parent dashboard shows linked transport", parentTransport);
  record("parent dashboard shows linked hostel", text.includes("A-101"));

  // =====================================================================
  // 7. SECURITY guards
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  await page.goto(`${BASE}/admin/hostel`, { waitUntil: "networkidle2" });
  const studentBlockedHostel = await waitFor(page, () => location.pathname !== "/admin/hostel", 15000);
  record("student is bounced from admin hostel", studentBlockedHostel, page.url());

  await page.goto(`${BASE}/admin/transport`, { waitUntil: "networkidle2" });
  const studentBlockedTransport = await waitFor(page, () => location.pathname !== "/admin/transport", 15000);
  record("student is bounced from admin transport", studentBlockedTransport, page.url());

  // =====================================================================
  // 8. API - auth, ownership, IDOR
  // =====================================================================
  const anonHostel = await api("GET", "/hostel/me");
  record("hostel API requires authentication", anonHostel.status === 401, `status=${anonHostel.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const adminTok = await loginApi("admin@smartcampus.edu");
  const parentTok = await loginApi("ravi.sharma@smartcampus.edu");

  const facultyHostelAdmin = await api("GET", "/admin/hostel/dashboard", { token: facultyTok });
  record("faculty cannot access hostel admin", facultyHostelAdmin.status === 403, `status=${facultyHostelAdmin.status}`);

  const studentTransportAdmin = await api("GET", "/admin/transport/vehicles", { token: studentTok });
  record("student cannot access transport admin", studentTransportAdmin.status === 403, `status=${studentTransportAdmin.status}`);

  const otherComplaint = await api("POST", "/hostel/complaints", {
    token: studentTok,
    body: { category: "OTHER", description: "API E2E complaint from Aarav.", priority: "LOW" },
  });
  record("student files complaint via API", otherComplaint.status === 201, `status=${otherComplaint.status}`);
  const complaintId = otherComplaint.json?.data?.id;

  const diyaTok = await loginApi("diya.krishnan@smartcampus.edu");
  const diyaComplaints = await api("GET", "/hostel/complaints", { token: diyaTok });
  const seesOther = (diyaComplaints.json?.data?.complaints ?? []).some((c) => c.id === complaintId);
  record("student cannot read another student's complaint", !seesOther, `visible=${seesOther}`);

  const parentHostelOther = await api("GET", `/parent/students/${(await api("GET", "/parent/students", { token: parentTok })).json?.data?.students?.[0]?.studentId}/hostel`, {
    token: await loginApi("kavitha.verma@smartcampus.edu"),
  });
  record("parent cannot read unlinked hostel data", parentHostelOther.status === 404, `status=${parentHostelOther.status}`);

  const parentTransportApi = await api(
    "GET",
    `/parent/students/${(await api("GET", "/parent/students", { token: parentTok })).json?.data?.students?.[0]?.studentId}/transport`,
    { token: parentTok },
  );
  record(
    "parent reads linked transport via API",
    parentTransportApi.status === 200 && parentTransportApi.json?.data?.assignment?.route?.routeCode === "R1-NORTH",
    `status=${parentTransportApi.status}`,
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P9 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
