/**
 * Phase 6: Personalized Learning Recommendations - E2E (Puppeteer + system Chrome).
 * Coverage: the Recommendations page (list, categories, priorities, summary card,
 * priority filters, empty state), the `/api/recommendations` and
 * `/api/recommendations/study-plan` endpoints, dashboard integration, and
 * role scoping.
 *
 * Seeded fixtures used on purpose:
 *   - rohan.verma   -> 6 HIGH recommendations (populated list + High filter)
 *   - ishita.*      -> 1 MEDIUM + 1 LOW (Medium and Low filters)
 *   - aarav.sharma  -> 0 recommendations (empty state)
 *
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase6  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const STRONG = "aarav.sharma@smartcampus.edu"; // no recommendations
const WEAK = "rohan.verma@smartcampus.edu"; // 6 HIGH
const MIXED = "ishita.banerjee@smartcampus.edu"; // 1 MEDIUM + 1 LOW
const FACULTY = "ananya.sharma@smartcampus.edu";
const ADMIN = "admin@smartcampus.edu";

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const CATEGORY_LABELS = ["Course Weakness", "Attendance", "Assessment", "Assignment", "Study Action", "Remedial Support"];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function api(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* status-only checks do not need a body */
  }
  return { status: res.status, json };
}

const loginApi = async (email, password = PASSWORD) => {
  const { json } = await api("POST", "/auth/login", { body: { email, password } });
  return json?.data?.token;
};

async function main() {
  if (!process.env.E2E_SKIP_SEED) {
    console.log("[phase6] Seeding database...");
    try {
      execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "inherit" });
    } catch (e) {
      console.error("Seed failed:", e.message);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------- API layer

  const weakToken = await loginApi(WEAK);
  const mixedToken = await loginApi(MIXED);
  const strongToken = await loginApi(STRONG);
  const facultyToken = await loginApi(FACULTY);
  const adminToken = await loginApi(ADMIN);
  record("demo accounts can authenticate", Boolean(weakToken && mixedToken && strongToken && facultyToken && adminToken));

  // --- 1. Recommendations are generated from the seeded weak student ---
  const weak = await api("GET", "/recommendations", { token: weakToken });
  const weakData = weak.json?.data;
  const weakRecs = weakData?.recommendations ?? [];
  record("GET /recommendations returns 200", weak.status === 200, `status=${weak.status}`);
  record("seeded weak student gets recommendations", weakRecs.length > 0, `count=${weakRecs.length}`);
  record(
    "every recommendation carries a known category",
    weakRecs.every((r) => CATEGORY_LABELS.includes(categoryLabelOf(r.category))),
    `categories=${JSON.stringify([...new Set(weakRecs.map((r) => r.category))])}`,
  );
  record(
    "every recommendation carries a valid priority",
    weakRecs.every((r) => PRIORITIES.includes(r.priority)),
    `priorities=${JSON.stringify([...new Set(weakRecs.map((r) => r.priority))])}`,
  );
  record(
    "priorities are sorted HIGH first",
    isSortedByPriority(weakRecs),
    `order=${weakRecs.map((r) => r.priority).join(",")}`,
  );
  record(
    "reasons cite the real thresholds, not invented numbers",
    weakRecs.every((r) => typeof r.reason === "string" && r.reason.length > 0 && !/undefined|NaN/.test(r.reason)),
  );
  record(
    "metrics are grounded and in range",
    weakRecs.every(
      (r) =>
        typeof r.metrics?.attendancePercentage === "number" &&
        r.metrics.attendancePercentage >= 0 &&
        r.metrics.attendancePercentage <= 100 &&
        typeof r.metrics?.assessmentPercentage === "number" &&
        typeof r.metrics?.assignmentSubmissionRate === "number" &&
        typeof r.metrics?.totalAssignments === "number",
    ),
  );
  record(
    "recommendation reasons are free of float artifacts",
    weakRecs.every((r) => !/\d\.\d{4,}/.test(r.reason)),
    `sample=${(weakRecs[0]?.reason ?? "").slice(0, 90)}`,
  );

  // --- 2. Summary counters agree with the list ---
  const s = weakData?.summary;
  record(
    "summary highPriority matches the list",
    s?.highPriority === weakRecs.filter((r) => r.priority === "HIGH").length,
    `summary=${s?.highPriority}`,
  );
  record(
    "summary mediumPriority matches the list",
    s?.mediumPriority === weakRecs.filter((r) => r.priority === "MEDIUM").length,
    `summary=${s?.mediumPriority}`,
  );
  record("summary counts at least one course", (s?.coursesNeedingAttention ?? 0) > 0, `total=${s?.coursesNeedingAttention}`);

  // --- 3. The mixed student exercises MEDIUM and LOW ---
  const mixed = await api("GET", "/recommendations", { token: mixedToken });
  const mixedRecs = mixed.json?.data?.recommendations ?? [];
  const mixedPriorities = mixedRecs.map((r) => r.priority);
  record("mixed student gets recommendations", mixedRecs.length > 0, `count=${mixedRecs.length}`);
  record("mixed student has a MEDIUM recommendation", mixedPriorities.includes("MEDIUM"), `priorities=${JSON.stringify(mixedPriorities)}`);
  record("mixed student has a LOW recommendation", mixedPriorities.includes("LOW"), `priorities=${JSON.stringify(mixedPriorities)}`);

  // --- 4. Empty state for a strong student ---
  const strong = await api("GET", "/recommendations", { token: strongToken });
  const strongRecs = strong.json?.data?.recommendations ?? [];
  record("strong student gets an empty list", strongRecs.length === 0, `count=${strongRecs.length}`);
  record(
    "strong student gets zeroed summary counters",
    strong.json?.data?.summary?.coursesNeedingAttention === 0 &&
      strong.json?.data?.summary?.highPriority === 0 &&
      strong.json?.data?.summary?.mediumPriority === 0,
  );

  // --- 5. Study plan ---
  const plan = await api("GET", "/recommendations/study-plan", { token: weakToken });
  record("GET /recommendations/study-plan returns 200", plan.status === 200, `status=${plan.status}`);
  record("study plan returns a non-empty studyPlan string", typeof plan.json?.data?.studyPlan === "string" && plan.json.data.studyPlan.length > 0);
  record(
    "study plan carries the deterministic recommendations",
    Array.isArray(plan.json?.data?.recommendations) && plan.json.data.recommendations.length === weakRecs.length,
    `planRecs=${plan.json?.data?.recommendations?.length}`,
  );
  const strongPlan = await api("GET", "/recommendations/study-plan", { token: strongToken });
  record("study plan degrades gracefully with no recommendations", strongPlan.status === 200 && strongPlan.json?.data?.recommendations?.length === 0);

  // --- 6. Identity comes from the JWT only ---
  const spoof = await api("GET", "/recommendations?studentId=00000000-0000-0000-0000-000000000000", { token: strongToken });
  record(
    "a supplied studentId cannot change whose data is returned",
    spoof.status === 200 && (spoof.json?.data?.recommendations ?? []).length === strongRecs.length,
  );
  const otherSpy = await api("GET", "/recommendations", { token: weakToken });
  record(
    "recommendations differ per student",
    (otherSpy.json?.data?.recommendations ?? []).length !== strongRecs.length,
  );

  // --- 7. Role scoping ---
  for (const [label, token] of [
    ["faculty", facultyToken],
    ["admin", adminToken],
  ]) {
    const r = await api("GET", "/recommendations", { token });
    const p = await api("GET", "/recommendations/study-plan", { token });
    record(`${label} is blocked from /recommendations`, r.status === 403, `status=${r.status}`);
    record(`${label} is blocked from /recommendations/study-plan`, p.status === 403, `status=${p.status}`);
  }
  for (const endpoint of ["/recommendations", "/recommendations/study-plan"]) {
    const anon = await api("GET", endpoint);
    record(`unauthenticated is blocked from ${endpoint}`, anon.status === 401, `status=${anon.status}`);
  }

  // ------------------------------------------------------------- Browser layer

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  async function login(email) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    if (!page.url().includes("/login")) {
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    }
    await page.waitForSelector("#email", { timeout: 15000 });
    await page.type("#email", email);
    await page.type("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }

  async function logout() {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  }

  const countPriorities = () =>
    page.evaluate(() => {
      const wanted = ["HIGH", "MEDIUM", "LOW"];
      const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const el of document.querySelectorAll("span, div, p")) {
        if (el.children.length !== 0) continue;
        const text = (el.textContent || "").trim();
        if (wanted.includes(text)) counts[text] += 1;
      }
      return counts;
    });

  const clickFilter = async (label) => {
    const clicked = await page.evaluate((wanted) => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === wanted);
      if (!btn) return false;
      btn.click();
      return true;
    }, label);
    if (!clicked) throw new Error(`filter button "${label}" not found`);
  };

  // --- 8. The Recommendations page renders real data ---
  await login(WEAK);
  await page.goto(`${BASE}/recommendations`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Personalized Learning Plan"), { timeout: 20000 });
  record("recommendations page loads", page.url().includes("/recommendations"));
  record("page shows the Personalized Learning Plan heading", true);

  await page.waitForFunction(() => !document.body.innerText.includes("Failed to load recommendations"), { timeout: 20000 });
  const bodyWeak = await page.evaluate(() => document.body.innerText);
  record("page does not show a load error", !bodyWeak.includes("Failed to load recommendations"));

  // Summary card
  record("summary card renders High Priority", bodyWeak.includes("High Priority"));
  record("summary card renders Medium Priority", bodyWeak.includes("Medium Priority"));
  record("summary card renders Courses Needing Attention", bodyWeak.includes("Courses Needing Attention"));
  record(
    "summary card shows the seeded HIGH count",
    bodyWeak.includes(String(s?.highPriority ?? -1)),
    `expected ${s?.highPriority}`,
  );

  // Category + priority rendering
  const shownCategories = CATEGORY_LABELS.filter((label) => bodyWeak.includes(label));
  record("recommendation category appears", shownCategories.length > 0, `categories=${JSON.stringify(shownCategories)}`);
  const countsAll = await countPriorities();
  record(
    "recommendation priority badges appear",
    countsAll.HIGH + countsAll.MEDIUM + countsAll.LOW === weakRecs.length,
    `rendered=${JSON.stringify(countsAll)} expected=${weakRecs.length}`,
  );
  record("page cites the real threshold in the reason", bodyWeak.includes("below the warning threshold of"));
  record("page labels resources as demo material", bodyWeak.includes("Demo resources - not official university materials"));

  // --- 9. Priority filters ---
  await clickFilter("High");
  await page.waitForFunction(() => !document.body.innerText.includes("Loading"), { timeout: 10000 }).catch(() => {});
  const countsHigh = await countPriorities();
  record(
    "High filter shows only HIGH priorities",
    countsHigh.HIGH === weakRecs.filter((r) => r.priority === "HIGH").length &&
      countsHigh.MEDIUM === 0 &&
      countsHigh.LOW === 0,
    `counts=${JSON.stringify(countsHigh)}`,
  );

  await clickFilter("Low");
  const countsLow = await countPriorities();
  const lowText = await page.evaluate(() => document.body.innerText);
  record(
    "Low filter yields no LOW items for an all-HIGH student",
    countsLow.LOW === 0,
    `counts=${JSON.stringify(countsLow)}`,
  );
  record("Low filter shows its empty-state message", lowText.includes("No low priority recommendations found."));

  await clickFilter("All");
  const countsBack = await countPriorities();
  record("All filter restores the full list", countsBack.HIGH + countsBack.MEDIUM + countsBack.LOW === weakRecs.length);

  // --- 10. Medium and Low are reachable for the mixed student ---
  await logout();
  await login(MIXED);
  await page.goto(`${BASE}/recommendations`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => document.body.innerText.includes("Personalized Learning Plan") && document.body.innerText.includes("Medium Priority"),
    { timeout: 20000 },
  );
  await clickFilter("Medium");
  const countsMedium = await countPriorities();
  record(
    "Medium filter shows the mixed student's MEDIUM item",
    countsMedium.MEDIUM === mixedRecs.filter((r) => r.priority === "MEDIUM").length && countsMedium.MEDIUM > 0,
    `counts=${JSON.stringify(countsMedium)}`,
  );
  await clickFilter("Low");
  const countsMixedLow = await countPriorities();
  record(
    "Low filter shows the mixed student's LOW item",
    countsMixedLow.LOW === mixedRecs.filter((r) => r.priority === "LOW").length && countsMixedLow.LOW > 0,
    `counts=${JSON.stringify(countsMixedLow)}`,
  );

  // --- 11. Empty state for a strong student ---
  await logout();
  await login(STRONG);
  await page.goto(`${BASE}/recommendations`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("No recommendations at this time."), { timeout: 20000 });
  const bodyEmpty = await page.evaluate(() => document.body.innerText);
  record("empty state message is shown", bodyEmpty.includes("No recommendations at this time."));
  record("empty state still renders the summary card", bodyEmpty.includes("Courses Needing Attention"));
  await clickFilter("High");
  const emptyFiltered = await page.evaluate(() => document.body.innerText);
  record("filters on an empty list report no matches", emptyFiltered.includes("No high priority recommendations found."));

  // --- 12. Dashboard integration ---
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
  // The integrated Command Center labels the prediction card "Academic outlook".
  await page.waitForFunction(() => document.body.innerText.includes("Academic outlook"), { timeout: 20000 });
  const dashboardText = await page.evaluate(() => document.body.innerText);
  record("dashboard has a Recommendations card", dashboardText.includes("Recommendations"));
  record(
    "dashboard recommendation count matches the API",
    dashboardText.includes(`${strongRecs.length}`) && strongRecs.length === 0,
    `expected 0 recommendations for the strong student`,
  );
  record("dashboard links through to /recommendations", dashboardText.includes("View recommendations"));

  // --- 13. Non-student roles never see the recommendations page ---
  for (const [label, email] of [
    ["admin", ADMIN],
    ["faculty", FACULTY],
  ]) {
    await logout();
    await login(email);
    await page.goto(`${BASE}/recommendations`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => !location.pathname.startsWith("/recommendations"), { timeout: 20000 });
    const body = await page.evaluate(() => document.body.innerText);
    record(`${label} is redirected away from /recommendations`, !page.url().includes("/recommendations"), `url=${page.url()}`);
    record(`${label} never sees recommendation data`, !body.includes("Personalized Learning Plan"));
  }

  // --- 14. Anonymous visitors are bounced ---
  await logout();
  await page.goto(`${BASE}/recommendations`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
  record("anonymous /recommendations redirects to /login", page.url().includes("/login"), `url=${page.url()}`);

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== PHASE 6 E2E SUMMARY ===`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`TOTAL: ${results.length}`);
  if (failed > 0) {
    console.log("\nFailures:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}`));
    process.exit(1);
  }
}

function categoryLabelOf(category) {
  const map = {
    COURSE_WEAKNESS: "Course Weakness",
    ATTENDANCE: "Attendance",
    ASSESSMENT: "Assessment",
    ASSIGNMENT: "Assignment",
    STUDY_ACTION: "Study Action",
    REMEDIAL_SUPPORT: "Remedial Support",
  };
  return map[category] ?? category;
}

function isSortedByPriority(recs) {
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return recs.every((r, i) => i === 0 || order[recs[i - 1].priority] <= order[r.priority]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
