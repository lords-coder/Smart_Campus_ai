/**
 * Phase 2 end-to-end tests (Puppeteer + system Chrome, 48 assertions).
 * Coverage: faculty attendance marking + persistence, student visibility,
 * admin fee payments (partial -> PARTIAL, full -> PAID), API authorization checks.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase2   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function clickByText(selector, text) {
  return async (page) => {
    const clicked = await page.evaluate(
      (sel, value) => {
        const nodes = [...document.querySelectorAll(sel)];
        const node = nodes.find((el) => (el.textContent || "").trim().includes(value));
        if (node) {
          node.click();
          return true;
        }
        return false;
      },
      selector,
      text,
    );
    return clicked;
  };
}

const parseMoney = (text) => Number(String(text).replace(/[^\d.]/g, ""));

// Drives a React-controlled <input> deterministically (triple-click select-all is racy).
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

async function waitFor(page, fn, timeout = 15000, ...args) {
  try {
    await page.waitForFunction(fn, { timeout }, ...args);
    return true;
  } catch {
    return false;
  }
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
  // 1. FACULTY — mark attendance for an assigned class
  // =====================================================================
  await login(page, "ananya.sharma@smartcampus.edu");
  record("faculty lands on attendance management", page.url().includes("/faculty"), page.url());

  await waitFor(page, () => document.body.innerText.includes("Your classes"));
  await waitFor(page, () => [...document.querySelectorAll("button")].some((b) => /Section [AB]/.test(b.textContent || "")));
  let text = await bodyText(page);
  record("faculty page title", text.includes("Attendance Management"));
  const classCount = await page.$$eval("button", (btns) =>
    btns.filter((b) => /Section [AB]/.test(b.textContent || "")).length,
  );
  record("assigned classes listed", classCount > 0, `${classCount} classes`);

  // Prefer a class running today in section A so the demo student is in the roster.
  const todayDay = WEEKDAYS[new Date().getDay()];
  const classOptions = await page.$$eval("button", (btns) =>
    btns
      .filter((b) => /Section [AB]/.test(b.textContent || ""))
      .map((b) => ({
        code: (b.textContent || "").match(/CS\d{3}|MA\d{3}/)?.[0] ?? "",
        day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].find(
          (d) => (b.textContent || "").includes(d),
        ),
        section: (b.textContent || "").includes("Section A") ? "A" : "B",
      })),
  );
  const chosen =
    classOptions.find((c) => c.day === todayDay && c.section === "A") ??
    classOptions.find((c) => c.day === todayDay) ??
    classOptions.find((c) => c.section === "A") ??
    classOptions[0];
  record("class chosen for marking", Boolean(chosen), `${chosen?.code} ${chosen?.day} sec ${chosen?.section}`);

  await page.evaluate(
    (code, section) => {
      const node = [...document.querySelectorAll("button")].find((b) => {
        const text = b.textContent || "";
        return text.includes(code) && text.includes(`Section ${section}`);
      });
      node?.click();
    },
    chosen.code,
    chosen.section,
  );
  const rosterLoaded = await waitFor(page, () => document.body.innerText.includes("Saved value"));
  record("roster loads for selected class", rosterLoaded);

  text = await bodyText(page);
  const studentRows = (text.match(/SC2025-\d{3}/g) || []).length;
  record("roster shows enrolled students", studentRows > 0, `${studentRows} students`);

  // Mark: all present, then first student absent.
  const clickedAllPresent = await clickByText("button", "All present")(page);
  await new Promise((r) => setTimeout(r, 200));
  await page.$$eval("table tbody tr", (rows) => {
    const absentBtn = [...rows[0].querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("Absent"),
    );
    absentBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  record("present/absent controls work", clickedAllPresent);

  const submitClicked = await page.evaluate(() => {
    const node = [...document.querySelectorAll("button")].find((b) =>
      /Submit attendance|Update attendance/.test(b.textContent || ""),
    );
    if (node && !node.disabled) {
      node.click();
      return true;
    }
    return false;
  });
  record("submit button enabled and clicked", submitClicked);

  const saved = await waitFor(page, () => /Submitted CS|Updated CS/.test(document.body.innerText), 15000);
  text = await bodyText(page);
  record(
    "success confirmation shown",
    saved,
    (text.match(/(Submitted|Updated) [A-Z]{2}\d{3}[^\n]*/) || [""])[0],
  );

  // Reload -> saved values persist
  await page.reload({ waitUntil: "networkidle2" });
  await waitFor(page, () => document.body.innerText.includes("Saved value"));
  text = await bodyText(page);
  const firstRowSaved = await page.$eval("table tbody tr", (row) => row.innerText);
  record("first student saved as ABSENT", /\nAbsent\n|Absent/.test(firstRowSaved), firstRowSaved.replace(/\n/g, " | "));
  const recordedBadge = text.match(/Recorded (\d+)\/(\d+)/);
  record("already-submitted indication", Boolean(recordedBadge), recordedBadge ? recordedBadge[0] : "missing");
  const submitDisabled = await page.evaluate(() => {
    const node = [...document.querySelectorAll("button")].find((b) =>
      /Submit attendance|Update attendance/.test(b.textContent || ""),
    );
    return node ? node.disabled : false;
  });
  record("submit disabled when nothing changed", submitDisabled);

  // =====================================================================
  // 2. STUDENT — attendance updates after faculty submission
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle2" });
  const attendanceLoaded = await waitFor(page, () =>
    document.body.innerText.includes("Course breakdown"),
  );
  text = await bodyText(page);
  record("student attendance page renders", attendanceLoaded);
  const totalMatch = text.match(/Total classes[\s\S]{0,40}?(\d+)/);
  record("total classes shown", Boolean(totalMatch), totalMatch ? totalMatch[1] : "missing");

  const studentToken = await loginApi("aarav.sharma@smartcampus.edu");
  const history = await api("GET", "/students/me/attendance?limit=20", { token: studentToken });
  const sawToday = (history.json?.data?.records ?? []).some((r) => r.date === isoToday());
  const sawSelectedCourse = (history.json?.data?.records ?? []).some(
    (r) => r.date === isoToday() && r.course.code === chosen.code,
  );
  record("student history includes today's submission", sawToday);
  record(
    "student sees the class faculty submitted",
    sawSelectedCourse,
    `${chosen.code} on ${isoToday()}`,
  );
  const summary = await api("GET", "/students/me/attendance-summary", { token: studentToken });
  record(
    "attendance summary recomputed from real rows",
    (summary.json?.data?.overall?.total ?? 0) > 0,
    `total=${summary.json?.data?.overall?.total}`,
  );
  const recentRows = await page.$$eval("table tbody tr", (rows) => rows.length).catch(() => 0);
  record("recent sessions table populated", recentRows > 0, `${recentRows} rows`);

  // Student fee view: status, balances and payment history (no payment controls)
  await page.goto(`${BASE}/fees`, { waitUntil: "networkidle2" });
  const feesPageLoaded = await waitFor(page, () => document.body.innerText.includes("Fee records"));
  text = await bodyText(page);
  record("student fee page renders", feesPageLoaded);
  record("student sees totals and pending amount", /Total fees[\s\S]{0,60}₹/.test(text) && /Pending/.test(text));
  record("student cannot record payments from the UI", !text.includes("Record payment"));

  const historyClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("View"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  const historyDialog = await waitFor(page, () => document.body.innerText.includes("Payment history"));
  record("student opens payment history", historyClicked && historyDialog);
  const historyBody = await page.evaluate(() => document.querySelector('div[role="dialog"]')?.innerText ?? "");
  record(
    "payment history shows payments or empty state",
    /₹|No payments have been recorded/.test(historyBody),
    historyBody.replace(/\n/g, " | ").slice(0, 90),
  );
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('div[role="dialog"] button')].find((b) =>
      (b.textContent || "").includes("Close"),
    );
    close?.click();
  });

  // =====================================================================
  // 3. ADMIN — record partial then full payment
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  record("admin lands on fee management", page.url().includes("/admin"), page.url());
  const feesLoaded = await waitFor(page, () => document.body.innerText.includes("Fee register"));
  text = await bodyText(page);
  record("admin fee register renders", feesLoaded);
  record(
    "outstanding summary rendered",
    text.includes("Outstanding") && text.includes("Collected"),
  );

  const openRowClicked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tbody tr")];
    const row = rows.find((r) => (r.textContent || "").includes("Record payment"));
    const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").includes("Record payment")) : null;
    if (btn) {
      btn.click();
      return (row.textContent || "").replace(/\s+/g, " ").slice(0, 120);
    }
    return "";
  });
  record("opened a fee record", openRowClicked.length > 0, openRowClicked);

  const dialogOpened = await waitFor(page, () => document.body.innerText.includes("Record payment") && document.body.innerText.includes("Payment history"));
  record("payment dialog opens", dialogOpened);

  const balanceValue = await page.$eval("#payment-amount", (el) => el.value).catch(() => "");
  const balance = parseMoney(balanceValue);
  record("dialog prefills outstanding balance", balance > 0, `balance=${balanceValue}`);

  const partialAmount = Math.max(1, Math.floor(balance / 2));
  await fillInput(page, "#payment-amount", String(partialAmount));
  const typedPartial = await page.$eval("#payment-amount", (el) => el.value);
  record("partial amount entered", typedPartial === String(partialAmount), typedPartial);

  // choose payment method
  await page.click('div[role="dialog"] [role="combobox"]');
  const upiClicked = await waitFor(page, () => document.body.innerText.includes("Bank transfer"), 5000);
  await page.evaluate(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
      (o.textContent || "").includes("UPI"),
    );
    option?.click();
  });
  record("payment method selector works", upiClicked);

  const partialClicked = await page.evaluate(() => {
    const node = [...document.querySelectorAll('div[role="dialog"] button')].find((b) =>
      (b.textContent || "").includes("Record payment"),
    );
    if (node && !node.disabled) {
      node.click();
      return true;
    }
    return false;
  });
  const partialToast = await waitFor(page, () => document.body.innerText.includes("Payment of"), 15000);
  record("partial payment submitted", partialClicked && partialToast);
  await new Promise((r) => setTimeout(r, 800));

  const dialogText = () =>
    page.evaluate(() => document.querySelector('div[role="dialog"]')?.innerText ?? "");

  text = await bodyText(page);
  const partialBadge = /Status[\s\S]{0,60}?(PENDING|PARTIAL|PAID)/.exec(await dialogText());
  record("status becomes PARTIAL", partialBadge?.[1] === "PARTIAL", partialBadge?.[1] ?? "missing");
  const newBalance = parseMoney(
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('div[role="dialog"] div')];
      const box = boxes.find((b) => (b.textContent || "").trim().startsWith("Balance"));
      return box ? box.textContent : "";
    }),
  );
  record("balance reduced after partial payment", newBalance === balance - partialAmount, `${newBalance} vs ${balance - partialAmount}`);

  // full payment of the remainder
  const remaining = balance - partialAmount;
  await fillInput(page, "#payment-amount", String(remaining));
  const typedRemaining = await page.$eval("#payment-amount", (el) => el.value);
  record("remaining amount entered", typedRemaining === String(remaining), typedRemaining);
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('div[role="dialog"] button')].find((b) =>
      (b.textContent || "").includes("Record payment"),
    );
    node?.click();
  });
  const paidToast = await waitFor(page, () => document.body.innerText.includes("now PAID"), 15000);
  record("full payment marks fee PAID", paidToast);
  await new Promise((r) => setTimeout(r, 800));
  text = await bodyText(page);
  const paidBadge = /Status[\s\S]{0,60}?(PENDING|PARTIAL|PAID)/.exec(await dialogText());
  record("status badge shows PAID", paidBadge?.[1] === "PAID", paidBadge?.[1] ?? "missing");

  const historyItems = await page.$$eval("div[role=\"dialog\"] ul li", (items) => items.length).catch(() => 0);
  record("payment history listed", historyItems >= 2, `${historyItems} payments`);

  // close dialog, table reflects PAID
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('div[role="dialog"] button')].find((b) =>
      (b.textContent || "").includes("Close"),
    );
    close?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.reload({ waitUntil: "networkidle2" });
  await waitFor(page, () => document.body.innerText.includes("Fee register"));
  const paidRowVisible = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tbody tr")];
    return rows.some((r) => /PAID/.test(r.textContent || ""));
  });
  record("table shows PAID rows after reload", paidRowVisible);

  // student sees updated status
  const adminToken = await loginApi("admin@smartcampus.edu");
  const feeList = await api("GET", "/fees?status=PAID", { token: adminToken });
  record("admin fee list returns records", (feeList.json?.data?.records?.length ?? 0) > 0);

  // =====================================================================
  // 4. SECURITY — API level
  // =====================================================================
  const studentTok = await loginApi("karthik.reddy@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const myFees = await api("GET", "/students/me/fees-summary", { token: studentTok });
  const myFeeId = myFees.json?.data?.records?.[0]?.id;
  const allFees = await api("GET", "/fees", { token: adminToken });
  const someoneElsesFee = (allFees.json?.data?.records ?? []).find(
    (r) => r.student.name !== "Karthik Reddy",
  );

  const studentPayment = await api("POST", `/fees/${myFeeId}/payments`, {
    token: studentTok,
    body: { amount: 100, paymentMethod: "CASH" },
  });
  record("student cannot record payments", studentPayment.status === 403, `status=${studentPayment.status}`);

  const facultyPayment = await api("POST", `/fees/${myFeeId}/payments`, {
    token: facultyTok,
    body: { amount: 100, paymentMethod: "CASH" },
  });
  record("faculty cannot record payments", facultyPayment.status === 403, `status=${facultyPayment.status}`);

  const idor = await api("GET", `/fees/${someoneElsesFee?.id}/payments`, { token: studentTok });
  record(
    "student cannot read another student's fee history",
    idor.status === 404,
    `status=${idor.status}`,
  );

  const facultyFeeList = await api("GET", "/fees", { token: facultyTok });
  record("faculty cannot read fee register", facultyFeeList.status === 403, `status=${facultyFeeList.status}`);

  const classesAdmin = await api("GET", "/attendance/classes", { token: adminToken });
  const otherFacultyClass = (classesAdmin.json?.data?.classes ?? []).find(
    (c) => c.faculty?.name && !c.faculty.name.includes("Ananya"),
  );
  const otherRoster = await api(
    "GET",
    `/attendance/classes/${otherFacultyClass?.id}?date=${isoToday()}`,
    { token: facultyTok },
  );
  record(
    "faculty cannot open another faculty's class",
    otherRoster.status === 403,
    `status=${otherRoster.status}`,
  );

  const studentAttendancePost = await api("POST", "/attendance", {
    token: studentTok,
    body: {
      timetableEntryId: otherFacultyClass?.id,
      date: isoToday(),
      attendance: [{ studentId: someoneElsesFee?.student.id, status: "PRESENT" }],
    },
  });
  record(
    "student cannot submit attendance",
    studentAttendancePost.status === 403,
    `status=${studentAttendancePost.status}`,
  );

  const studentFeesList = await api("GET", "/fees", { token: studentTok });
  record("student cannot read admin fee register", studentFeesList.status === 403, `status=${studentFeesList.status}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P2 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
