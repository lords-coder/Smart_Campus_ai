/**
 * Ad-hoc module-flow probe: signs in as a role and visits each module page,
 * reporting whether real API data rendered. Not part of the E2E suites.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";

const FLOWS = {
  STUDENT: {
    email: "aarav.sharma@smartcampus.edu",
    home: "/dashboard",
    pages: [
      ["/dashboard", "Overall attendance"],
      ["/attendance", "Attendance"],
      ["/timetable", "Timetable"],
      ["/recommendations", "Personalized Learning Plan"],
      ["/ai", "Ask"],
      ["/fees", "Fees"],
      ["/hostel", "Hostel"],
      ["/transport", "Transport"],
      ["/certificates", "Certificate"],
      ["/library", "Library"],
      ["/placements", "Placements"],
      ["/mess", "Mess"],
      ["/alumni", "Alumni"],
    ],
  },
  PARENT: {
    email: "farah.khan@smartcampus.edu",
    home: "/parent",
    pages: [
      ["/parent", "Transport"],
      ["/parent", "Aarav"],
    ],
  },
  FACULTY: {
    email: "ananya.sharma@smartcampus.edu",
    home: "/faculty",
    pages: [
      ["/faculty", "Faculty"],
      ["/faculty/timetable", "Timetable"],
      ["/faculty/risk", "Risk"],
      ["/ai", "Ask"],
    ],
  },
  ADMIN: {
    email: "admin@smartcampus.edu",
    home: "/admin",
    pages: [
      ["/admin", "Admin"],
      ["/admin/transport", "Transport"],
      ["/admin/placements", "Placement"],
      ["/admin/library", "Library"],
      ["/admin/hostel", "Hostel"],
      ["/admin/mess", "Mess"],
      ["/admin/certificates", "Certificate"],
      ["/admin/risk", "Risk"],
      ["/admin/timetable", "Timetable"],
    ],
  },
  ALUMNI: {
    email: "arjun.menon@alumni.smartcampus.edu",
    home: "/alumni",
    pages: [
      ["/alumni", "Alumni"],
      ["/alumni/profile", "Profile"],
    ],
  },
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);

let failures = 0;
for (const [role, flow] of Object.entries(FLOWS)) {
  console.log(`\n=== ${role} (${flow.email}) ===`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#email");
  await page.type("#email", flow.email);
  await page.type("#password", "SmartCampus@2026");
  await page.click("button[type=submit]");
  await page.waitForFunction((h) => location.pathname === h, { timeout: 20000 }, flow.home).catch(() => {});
  const landed = page.url().includes(flow.home);
  console.log(`${landed ? "PASS" : "FAIL"}  lands on ${flow.home} :: ${page.url()}`);
  if (!landed) failures += 1;

  for (const [route, expect] of flow.pages) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
    let ok = false;
    try {
      await page.waitForFunction(
        (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
        { timeout: 15000 },
        expect,
      );
      ok = true;
    } catch {
      ok = false;
    }
    const text = await page.evaluate(() => document.body.innerText);
    const errored = /failed to load|something went wrong|could not reach the server/i.test(text);
    const bad = !ok || errored;
    if (bad) failures += 1;
    console.log(`${bad ? "FAIL" : "PASS"}  ${route} renders "${expect}"${errored ? " [error state]" : ""}`);
  }
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL MODULE FLOWS OK" : `${failures} FAILURES`}`);
process.exit(failures > 0 ? 1 : 0);
