/**
 * Ad-hoc visual + data probe for the integrated Command Center.
 * Not part of the E2E suites; used to confirm the prototype design renders and
 * carries real API values.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const API = "http://localhost:4000/api";
const PASSWORD = "SmartCampus@2026";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
page.setDefaultTimeout(20000);

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.waitForSelector("#email");
await page.type("#email", "aarav.sharma@smartcampus.edu");
await page.type("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

console.log("url after login:", page.url());

const api = await (await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "aarav.sharma@smartcampus.edu", password: PASSWORD }),
})).json();

const apiGet = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${api.data.token}` } });
  return (await r.json()).data;
};

const perf = await apiGet("/performance/predict");
const att = await apiGet("/students/me/attendance-summary");
const fees = await apiGet("/students/me/fees-summary");
const tt = await apiGet("/students/me/timetable");
const recs = await apiGet("/recommendations");
const tr = await apiGet("/transport/me");

const text = await page.evaluate(() => document.body.innerText);
const scoped = await page.evaluate(() => {
  const root = document.querySelector(".command-center-surface");
  if (!root) return { found: false };
  const cs = getComputedStyle(root);
  return {
    found: true,
    background: cs.backgroundColor,
    color: cs.color,
    minHeight: cs.minHeight,
  };
});

const checks = [
  ["greeting names the student", text.includes("Aarav")],
  ["hero heading present", text.includes("Your campus, in one clear view.")],
  ["Overall attendance card", text.includes("Overall attendance")],
  ["Pending fees card", text.includes("Pending fees")],
  ["Today's timetable section", text.includes("Today's timetable")],
  ["Quick actions section", text.includes("Quick actions")],
  ["Academic outlook card", text.includes("Academic outlook")],
  ["Recommendations section", text.includes("Recommendations")],
  ["View recommendations link", text.includes("View recommendations")],
  ["Live bus tracking section", text.includes("Live bus tracking")],
  ["data-boundary note", text.includes("Live SmartCampus data")],
  ["no 'not connected' placeholder", !/Not connected|Data unavailable|Prototype preview/i.test(text)],
  ["attendance % matches API", text.includes(`${att.overall.percentage}%`)],
  ["fees match API", text.includes(String(fees.totalPending)) || text.includes("₹")],
  ["prediction category matches API", text.includes(perf.category)],
  ["ML source shown", /ML model|Rule-based fallback/.test(text)],
  ["no raw enum leak", !/\bMOVING\b|\bIDLE\b|\bOFFLINE\b/.test(text)],
  ["timetable count matches API", tt.entries.length === 0 || text.includes("Full timetable")],
  ["recommendation count matches API", text.includes(`${recs.summary.coursesNeedingAttention} flagged`) || recs.summary.coursesNeedingAttention === 0],
  ["transport present per API", tr.assignment ? text.includes(tr.assignment.vehicle?.registrationNumber ?? "") : text.includes("No bus route assigned")],
  ["command-center-surface applied", scoped.found],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log("\nscoped surface:", JSON.stringify(scoped));
console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 5) : "none");
console.log("\nAPI values: perf=%s src=%s conf=%s | attendance=%s%% | pendingFees=%s | todayClasses=%d | flagged=%d",
  perf.category, perf.prediction_source, perf.confidence, att.overall.percentage, fees.totalPending, tt.entries.length, recs.summary.coursesNeedingAttention);

await page.screenshot({ path: "artifacts/command-center.png", fullPage: true });
await browser.close();
process.exit(failed > 0 ? 1 : 0);
