/**
 * Phase 4 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: AI chat UI (empty state, starter prompts, attendance/fee/timetable
 * questions, source badges, oversized-message error + retry + recovery, clear
 * conversation), role-aware starters for student/faculty/admin, the /ai role
 * guard, the unauthenticated bounce and the AI API auth/validation rules.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase4   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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
const chatText = (page) => page.evaluate(() => document.querySelector("#ai-messages")?.innerText || "");

async function api(method, path, { body, token, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
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

async function waitFor(page, fn, timeout = 15000, ...args) {
  try {
    await page.waitForFunction(fn, { timeout }, ...args);
    return true;
  } catch {
    return false;
  }
}

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

async function clickEl(page, selector) {
  return page.$eval(selector, (el) => {
    if (!el) return false;
    if (el.disabled) return false;
    el.click();
    return true;
  });
}

/** Waits until the chat transcript contains `needle`. */
const waitChat = (page, needle, timeout = 20000) =>
  waitFor(page, (n) => (document.querySelector("#ai-messages")?.innerText || "").includes(n), timeout, needle);

/** Counts assistant bubbles (user bubbles use justify-end). */
const assistantReplies = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#ai-messages > div")].filter(
      (el) => el.className.includes("justify-start") && el.querySelector("p"),
    ).length,
  );

const waitReplyCount = (page, count, timeout = 20000) =>
  waitFor(page, (n) => {
    const bubbles = [...document.querySelectorAll("#ai-messages > div")].filter(
      (el) => el.className.includes("justify-start") && el.querySelector("p"),
    );
    return bubbles.length >= n;
  }, timeout, count);

const badgeTexts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#ai-messages [data-slot='badge'], #ai-messages .rounded-md")].map(
      (el) => (el.textContent || "").trim(),
    ),
  );

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
  // 1. GUARD - anonymous visitors are bounced away from /ai
  // =====================================================================
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/ai`, { waitUntil: "networkidle2" });
  const bounced = await waitFor(page, () => location.pathname !== "/ai", 15000);
  record("anonymous visitor is bounced from /ai", bounced && page.url().includes("/login"), page.url());

  // =====================================================================
  // 2. STUDENT - chat flow, source badges, oversized error + retry
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "student nav links to the AI assistant",
    studentNav.some((label) => label.includes("AI Assistant")),
    JSON.stringify(studentNav),
  );

  await page.goto(`${BASE}/ai`, { waitUntil: "networkidle2" });
  const loaded = await waitFor(page, () => document.body.innerText.includes("Ask about your campus data"));
  let text = await bodyText(page);
  record("AI chat opens with an empty state", loaded, text.slice(0, 60).replace(/\n/g, " "));
  record(
    "AI chat explains the data scope",
    text.includes("your SmartCampus records"),
    (text.match(/Answers are generated[^.]*\./) || [""])[0],
  );

  const starters = await page.evaluate(() =>
    [...document.querySelectorAll("#ai-starters button")].map((b) => (b.textContent || "").trim()),
  );
  record("student sees starter prompts", starters.length >= 4, JSON.stringify(starters));
  record(
    "starters cover attendance, fees and timetable",
    starters.some((s) => s.includes("attendance")) &&
      starters.some((s) => s.toLowerCase().includes("fee")) &&
      starters.some((s) => s.toLowerCase().includes("classes")),
    JSON.stringify(starters),
  );

  const sendDisabledEmpty = await page.evaluate(() => document.querySelector("#ai-send")?.disabled === true);
  record("send is disabled while the input is empty", sendDisabledEmpty);

  // Starter prompt -> grounded attendance answer with a source badge.
  const starterClicked = await clickEl(page, "#ai-starters button");
  const attendanceAnswered = await waitChat(page, "Your overall attendance is");
  text = await chatText(page);
  record("starter prompt sends the question", starterClicked && attendanceAnswered, text.slice(0, 80).replace(/\n/g, " "));
  record(
    "attendance answer is grounded in real data",
    /\d+\.\d%/.test(text),
    (text.match(/\d+\.\d%/) || [""])[0],
  );
  const studentBadges = await badgeTexts(page);
  record(
    "attendance answer shows its source badge",
    studentBadges.some((b) => b.includes("Attendance data")),
    JSON.stringify(studentBadges),
  );
  const inputCleared = await page.evaluate(() => document.querySelector("#ai-input").value === "");
  record("input is cleared after sending", inputCleared);

  // Typed fee question.
  await fillInput(page, "#ai-input", "How much fee do I have pending?");
  await clickEl(page, "#ai-send");
  const feeAnswered = await waitChat(page, "Nothing is pending on your account");
  text = await chatText(page);
  record("fee question returns a payment summary", feeAnswered && text.includes("paid in total"), (text.match(/Nothing is pending[^.]*\./) || [""])[0]);
  record("fee answer shows its source badge", text.includes("Fee data"));
  record("previous replies are preserved", (await assistantReplies(page)) === 2, `${await assistantReplies(page)} replies`);

  // Typed timetable question.
  await fillInput(page, "#ai-input", "What classes do I have today?");
  await clickEl(page, "#ai-send");
  const dayName = await waitFor(
    page,
    () => /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/.test(document.querySelector("#ai-messages")?.innerText || ""),
    20000,
  );
  text = await chatText(page);
  record("timetable question answers for today", dayName, (text.match(/You (have|have no)[^\n]*/) || [""])[0].slice(0, 90));
  record("timetable answer shows its source badge", text.includes("Timetable data"));
  record("chat keeps the full transcript", (await assistantReplies(page)) === 3, `${await assistantReplies(page)} replies`);

  // Unknown course -> polite, scoped fallback.
  await fillInput(page, "#ai-input", "What's my attendance in Java?");
  await clickEl(page, "#ai-send");
  const unknownCourse = await waitChat(page, `couldn't find a course matching`);
  text = await chatText(page);
  record(
    "unknown course is handled gracefully",
    unknownCourse && /matching "java"/i.test(text),
    (text.match(/couldn't find a course[^\n]*/) || [""])[0].slice(0, 90),
  );

  // Oversized message -> inline error, retry re-sends, then a valid question recovers.
  await fillInput(page, "#ai-input", "x".repeat(1200));
  await clickEl(page, "#ai-send");
  const errorShown = await waitFor(page, () => document.querySelector("#ai-error") !== null, 20000);
  text = await bodyText(page);
  record("oversized message shows an inline error", errorShown, (text.match(/The assistant could not answer/) || [""])[0]);
  const retryClicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll("#ai-error button")].find((b) => (b.textContent || "").includes("Try again"));
    if (button) {
      button.click();
      return true;
    }
    return false;
  });
  const stillFailing = await waitFor(page, () => document.querySelector("#ai-error") !== null, 20000);
  record("retry re-sends the message", retryClicked && stillFailing);
  const errorText = await bodyText(page);
  record(
    "error message is actionable",
    /could not answer/i.test(errorText) && /request validation failed|invalid|too long|smaller/i.test(errorText),
    (errorText.match(/The assistant could not answer[\s\S]{0,140}/) || [""])[0].replace(/\s+/g, " ").slice(0, 140),
  );

  await fillInput(page, "#ai-input", "When is my next class?");
  await clickEl(page, "#ai-send");
  const recovered = await waitReplyCount(page, 5);
  const errorCleared = await waitFor(page, () => document.querySelector("#ai-error") === null, 20000);
  record("a valid question recovers the conversation", recovered && errorCleared);

  // Clear conversation resets to the empty state.
  const cleared = await clickEl(page, "#ai-clear");
  const emptyAgain = await waitFor(page, () => document.body.innerText.includes("Ask about your campus data"), 15000);
  const repliesAfterClear = await assistantReplies(page);
  record("clear resets the conversation", cleared && emptyAgain && repliesAfterClear === 0, `${repliesAfterClear} replies`);

  // =====================================================================
  // 3. FACULTY - role-scoped chat
  // =====================================================================
  await login(page, "ananya.sharma@smartcampus.edu");
  record("faculty lands on attendance management", page.url().includes("/faculty"), page.url());

  const facultyNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "faculty nav links to the AI assistant",
    facultyNav.some((label) => label.includes("AI Assistant")),
    JSON.stringify(facultyNav),
  );

  await page.goto(`${BASE}/ai`, { waitUntil: "networkidle2" });
  const facultyReady = await waitFor(page, () => document.body.innerText.includes("Ask about your campus data"));
  const facultyStarters = await page.evaluate(() =>
    [...document.querySelectorAll("#ai-starters button")].map((b) => (b.textContent || "").trim()),
  );
  record("faculty sees role-relevant starters", facultyReady && facultyStarters.length >= 3, JSON.stringify(facultyStarters));
  record(
    "faculty starters skip fee administration",
    !facultyStarters.some((s) => s.includes("institute")),
    JSON.stringify(facultyStarters),
  );

  await fillInput(page, "#ai-input", "What classes do I have today?");
  await clickEl(page, "#ai-send");
  const facultyAnswered = await waitReplyCount(page, 1);
  const facultyText = await chatText(page);
  record("faculty timetable question is answered", facultyAnswered, facultyText.slice(0, 100).replace(/\n/g, " "));
  record("faculty answer carries a source badge", facultyText.includes("Timetable data"));

  // =====================================================================
  // 4. ADMIN - institute-scoped chat
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  record("admin lands on fee management", page.url().includes("/admin"), page.url());

  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "admin nav links to the AI assistant",
    adminNav.some((label) => label.includes("AI Assistant")),
    JSON.stringify(adminNav),
  );

  await page.goto(`${BASE}/ai`, { waitUntil: "networkidle2" });
  const adminReady = await waitFor(page, () => document.body.innerText.includes("Ask about your campus data"));
  const adminStarters = await page.evaluate(() =>
    [...document.querySelectorAll("#ai-starters button")].map((b) => (b.textContent || "").trim()),
  );
  record("admin sees institute-level starters", adminReady && adminStarters.length >= 3, JSON.stringify(adminStarters));
  record(
    "admin starters differ from student starters",
    adminStarters.some((s) => s.includes("institute")) &&
      !adminStarters.some((s) => s.includes("What's my attendance in Data Structures?")),
    JSON.stringify(adminStarters),
  );

  await fillInput(page, "#ai-input", "How much fee is pending across the institute?");
  await clickEl(page, "#ai-send");
  const adminAnswered = await waitReplyCount(page, 1);
  const adminText = await chatText(page);
  record(
    "admin fee question uses the fee register",
    adminAnswered && adminText.includes("fee register"),
    adminText.slice(0, 110).replace(/\n/g, " "),
  );
  record("admin answer carries a source badge", adminText.includes("Fee data"));
  record(
    "admin transcript is independent of the student session",
    (await assistantReplies(page)) === 1,
    `${await assistantReplies(page)} replies`,
  );

  // =====================================================================
  // 5. API - auth, validation and response shape
  // =====================================================================
  const anonAsk = await api("POST", "/ai/ask", { body: { message: "What's my attendance?" } });
  record("AI endpoint requires authentication", anonAsk.status === 401, `status=${anonAsk.status}`);

  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");
  const ask = await api("POST", "/ai/ask", { token: studentTok, body: { message: "How much fee do I have pending?" } });
  const data = ask.json?.data ?? {};
  record(
    "AI endpoint answers with intent, sources and provider",
    ask.status === 200 &&
      typeof data.answer === "string" &&
      Boolean(data.intent) &&
      Array.isArray(data.sources) &&
      typeof data.provider === "string",
    `${ask.status} intent=${data.intent} provider=${data.provider}`,
  );
  record(
    "AI response exposes a source list",
    (data.sources || []).every((s) => ["attendance", "fees", "timetable"].includes(s)) &&
      (data.sources || []).length > 0,
    JSON.stringify(data.sources),
  );

  const empty = await api("POST", "/ai/ask", { token: studentTok, body: { message: "   " } });
  record("empty question is rejected", empty.status === 400, `${empty.status} ${empty.json?.error?.code}`);

  const malformed = await api("POST", "/ai/ask", { token: studentTok, raw: "{not json" });
  record("malformed JSON is rejected", malformed.status === 400 && malformed.json?.error?.code === "INVALID_JSON", `${malformed.status} ${malformed.json?.error?.code}`);

  const tooLong = await api("POST", "/ai/ask", { token: studentTok, body: { message: "a".repeat(1200) } });
  record("oversized question is rejected by validation", tooLong.status === 400, `${tooLong.status} ${tooLong.json?.error?.code}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P4 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
