/**
 * Ad-hoc visual QA sweep: one screenshot per role and per key page, plus a
 * light-container and overflow audit. Not part of the E2E suites.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const PASSWORD = "SmartCampus@2026";

const SHOTS = [
  ["/login", null, "login"],
  ["/dashboard", "aarav.sharma@smartcampus.edu", "student-dashboard"],
  ["/ai", "aarav.sharma@smartcampus.edu", "student-ai"],
  ["/recommendations", "aarav.sharma@smartcampus.edu", "student-recommendations"],
  ["/transport", "aarav.sharma@smartcampus.edu", "student-transport"],
  ["/mess", "aarav.sharma@smartcampus.edu", "student-mess"],
  ["/risk", null, null],
  ["/faculty", "ananya.sharma@smartcampus.edu", "faculty-dashboard"],
  ["/faculty/risk", "ananya.sharma@smartcampus.edu", "faculty-risk"],
  ["/parent", "farah.khan@smartcampus.edu", "parent-dashboard"],
  ["/admin", "admin@smartcampus.edu", "admin-dashboard"],
  ["/admin/transport", "admin@smartcampus.edu", "admin-transport"],
  ["/admin/library", "admin@smartcampus.edu", "admin-library"],
  ["/alumni", "arjun.menon@alumni.smartcampus.edu", "alumni-dashboard"],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
page.setDefaultTimeout(20000);
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));

async function signIn(email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 }).catch(() => {});
}

await signIn("aarav.sharma@smartcampus.edu");
await page.evaluate(() => window.localStorage.clear());

for (const [route, email, name] of SHOTS) {
  if (!name) continue;
  if (email) await signIn(email);
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1100));
  const audit = await page.evaluate(() => {
    const light = [];
    for (const el of document.querySelectorAll(".app-shell *")) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
      if (!m) continue;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (r > 190 && g > 190 && b > 190) {
        light.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}=${bg}`);
      }
    }
    const shell = document.querySelector(".app-shell");
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      light: [...new Set(light)].slice(0, 6),
      shellBg: shell ? getComputedStyle(shell).backgroundColor : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      clipped: [...document.querySelectorAll(".page-surface h1, .page-surface h2")]
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .map((n) => n.textContent.trim().slice(0, 30)),
    };
  });
  await page.screenshot({ path: `artifacts/qa-${name}.png`, fullPage: true });
  console.log(
    `${name.padEnd(24)} overflow=${audit.overflow} light=${audit.light.length} clipped=${audit.clipped.length} shell=${audit.shellBg} body=${audit.bodyBg}`,
  );
  if (audit.light.length) console.log(`   light: ${JSON.stringify(audit.light)}`);
  if (audit.clipped.length) console.log(`   clipped: ${JSON.stringify(audit.clipped)}`);
}

await browser.close();
console.log("\nconsole errors:", errors.length ? [...new Set(errors)].slice(0, 5) : "none");
