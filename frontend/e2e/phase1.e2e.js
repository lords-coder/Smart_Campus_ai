// Phase 1 E2E — login, role routing, dashboards, RBAC redirects, responsive shell.
// Prereq: docker compose up -d | backend npm run seed:test | backend npm run dev | frontend npm run dev
// Run:    npm run test:e2e   (from frontend/)
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = path.join(__dirname, "artifacts");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`);
}

async function login(page, email, password) {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", password);
  await Promise.all([
    page.waitForFunction(() => location.pathname !== "/login", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });

  // ---- 1. Login page renders
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  let text = await bodyText(page);
  record("login page renders", text.includes("SmartCampus AI") && text.includes("Welcome back"));

  // ---- 2. Invalid credentials show an error
  await page.type("#email", "aarav.sharma@smartcampus.edu");
  await page.type("#password", "wrong-password-123");
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () => document.body.innerText.toLowerCase().includes("invalid email or password"),
    { timeout: 10000 },
  ).catch(() => null);
  text = await bodyText(page);
  record("invalid login shows error", text.toLowerCase().includes("invalid email or password"));

  // ---- 3. Client-side validation blocks short password
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", "aarav.sharma@smartcampus.edu");
  await page.type("#password", "short");
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 500));
  text = await bodyText(page);
  record("login validation blocks short password", text.includes("at least 8 characters"));

  // ---- 4. Student login -> dashboard with real API data
  await login(page, "aarav.sharma@smartcampus.edu", "SmartCampus@2026");
  record("student login lands on /dashboard", page.url().includes("/dashboard"), page.url());
  // The Command Center renders each card's heading immediately and fills the
  // value once its API responds, so wait for the API-backed figure rather than
  // the heading before asserting on it.
  await page.waitForFunction(
    () => /Overall attendance[\s\S]{0,80}?\d{2,3}(?:\.\d)?%/.test(document.body.innerText),
    { timeout: 15000 },
  ).catch(() => null);
  text = await bodyText(page);
  record("dashboard welcome shows name", text.includes("Aarav"));
  record("dashboard shows attendance card", text.includes("Overall attendance"));
  const attendanceMatch = text.match(/Overall attendance[\s\S]{0,80}?(\d{2,3}(?:\.\d)?)%/);
  record("attendance % comes from API", Boolean(attendanceMatch), attendanceMatch ? attendanceMatch[1] + "%" : "not found");
  record("dashboard shows fee card", text.includes("Pending fees"));
  const feeMatch = text.match(/Pending fees[\s\S]{0,60}?₹([\d,]+)/);
  record("fee amounts rendered", Boolean(feeMatch), feeMatch ? feeMatch[1] : "not found");
  record("dashboard shows timetable or empty state", text.includes("Today's timetable"));
  record("dashboard shows quick actions", text.includes("Quick actions"));
  await page.screenshot({ path: path.join(SHOTS, "shot-dashboard.png"), fullPage: true });

  // ---- 5. Attendance page
  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Course breakdown"), {
    timeout: 15000,
  }).catch(() => null);
  text = await bodyText(page);
  const rowCount = await page.evaluate(
    () => document.querySelectorAll("table")[0]?.querySelectorAll("tbody tr").length ?? 0,
  );
  record("attendance table has course rows", rowCount >= 5, `rows=${rowCount}`);
  record("attendance page shows overall", /\d+%/.test(text));
  await page.screenshot({ path: path.join(SHOTS, "shot-attendance.png"), fullPage: true });

  // ---- 6. Fees page
  await page.goto(`${BASE}/fees`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Fee records"), {
    timeout: 15000,
  }).catch(() => null);
  const feeRows = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
  record("fees table has fee rows", feeRows >= 3, `rows=${feeRows}`);
  await page.screenshot({ path: path.join(SHOTS, "shot-fees.png"), fullPage: true });

  // ---- 7. Timetable page + day switch
  await page.goto(`${BASE}/timetable`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Timetable"), {
    timeout: 15000,
  }).catch(() => null);
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sat = btns.find((b) => b.textContent.trim() === "Sat");
    if (sat) {
      sat.click();
      return true;
    }
    return false;
  });
  await new Promise((r) => setTimeout(r, 800));
  const after = await page.evaluate(() => document.body.innerText);
  record("timetable day switcher works", clicked && after.includes("Saturday"), `clicked=${clicked}`);
  record("timetable handles empty day state", after.includes("No classes on Saturday"));
  await page.screenshot({ path: path.join(SHOTS, "shot-timetable.png"), fullPage: true });

  // ---- 8. Frontend route protection (no token)
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => null);
  record("unauthenticated /dashboard redirects to /login", page.url().includes("/login"), page.url());

  // ---- 9. Expired/invalid token handling
  await page.evaluate(() => localStorage.setItem("smartcampus_token", "garbage.token.value"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => null);
  record("invalid token redirects to /login", page.url().includes("/login"), page.url());

  // ---- 10. Admin role routing
  await login(page, "admin@smartcampus.edu", "SmartCampus@2026");
  record("admin lands on /admin", page.url().includes("/admin"), page.url());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => location.pathname !== "/dashboard", { timeout: 10000 }).catch(() => null);
  record("admin blocked from /dashboard (front-end)", page.url().includes("/admin"), page.url());
  await page.waitForFunction(() => document.body.innerText.includes("Fee register"), { timeout: 15000 }).catch(() => null);
  text = await bodyText(page);
  record("admin home renders", text.includes("Fee Management") && text.includes("Fee register"));

  // ---- 11. Faculty role routing
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await login(page, "ananya.sharma@smartcampus.edu", "SmartCampus@2026");
  record("faculty lands on /faculty", page.url().includes("/faculty"), page.url());
  await page.waitForFunction(() => document.body.innerText.includes("Your classes"), { timeout: 15000 }).catch(() => null);
  text = await bodyText(page);
  record("faculty home renders", text.includes("Attendance Management") && text.includes("Your classes"));
  await page.screenshot({ path: path.join(SHOTS, "shot-faculty.png"), fullPage: true });

  // ---- 12. Mobile responsive check
  await page.evaluate(() => localStorage.clear());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  const loginOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  record("mobile login has no horizontal overflow", loginOverflow <= 1, `overflow=${loginOverflow}px`);

  await login(page, "aarav.sharma@smartcampus.edu", "SmartCampus@2026");
  await page.waitForFunction(() => document.body.innerText.includes("Overall attendance"), {
    timeout: 15000,
  }).catch(() => null);
  const dashOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  record("mobile dashboard has no horizontal overflow", dashOverflow <= 1, `overflow=${dashOverflow}px`);

  const opened = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Open menu"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  await new Promise((r) => setTimeout(r, 500));
  const menuText = await bodyText(page);
  record("mobile sidebar opens", opened && menuText.includes("AI Assistant"));
  await page.screenshot({ path: path.join(SHOTS, "shot-mobile-dashboard.png"), fullPage: true });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("\n----------------------------------------");
  console.log(`TOTAL: ${results.length}  PASSED: ${results.length - failed.length}  FAILED: ${failed.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log("  FAILED:", f.name, f.detail));
    process.exit(1);
  }
})();
