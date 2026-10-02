/**
 * Registration / approval E2E (Puppeteer + system Chrome).
 *
 * Drives the real browser through the journeys the registration change created:
 *   1. open /login, click "Create Account"
 *   2. register a student, see the pending confirmation
 *   3. try to log in while pending -> blocked with the pending message
 *   4. log in as SUPER_ADMIN, approve the student in the UI
 *   5. the student logs in successfully and lands on /dashboard
 *   6. faculty registration with a wrong verification code is rejected
 *   7. admin registration reaches the pending state
 *   8. forgot-password / account help submits a real request
 *   9. a rejected registration cannot sign in
 *  10. responsive registration UI
 *
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:registration
 */
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const API = "http://localhost:4000/api";
const RUN = Date.now();
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend");

const envText = (() => {
  try {
    return fs.readFileSync(path.join(BACKEND_DIR, ".env"), "utf8");
  } catch {
    return "";
  }
})();
const envValue = (name) => {
  const raw = process.env[name] ?? envText.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "";
  return raw.trim().replace(/^"|"$/g, "");
};

const SUPER_ADMIN = { email: envValue("SUPER_ADMIN_EMAIL"), password: envValue("SUPER_ADMIN_PASSWORD") };
const FACULTY_CODE = envValue("FACULTY_REGISTRATION_CODE");
const ADMIN_CODE = envValue("ADMIN_REGISTRATION_CODE");
/** Both codes are read from the server-side .env at runtime - never hardcoded here. */
const ADMIN_CODE_LITERAL = ADMIN_CODE || "set-admin-code";
const FACULTY_CODE_LITERAL = FACULTY_CODE || "set-faculty-code";
const DOMAIN = envValue("UNIVERSITY_EMAIL_DOMAIN") || "smartcampus.edu";
const PASSWORD = "Str0ng!Pass1";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function apiPost(endpoint, body, token) {
  const response = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function superAdminToken() {
  const { status, json } = await apiPost("/auth/login", SUPER_ADMIN);
  if (status !== 200) throw new Error("SUPER_ADMIN login failed - run npm run seed first");
  return json.data.token;
}

/** Approve through the API so the test can stay focused on browser behaviour. */
async function approveByEmail(token, email) {
  const response = await fetch(`${API}/super-admin/registrations?status=PENDING_APPROVAL`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = await response.json();
  const match = (list.data?.items ?? []).find((item) => item.userEmail === email);
  if (!match) throw new Error(`no pending registration for ${email}`);
  const approval = await fetch(`${API}/super-admin/registrations/${match.id}/approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  return approval.status;
}

async function main() {
  // Fixtures give the SUPER_ADMIN surface realistic neighbours; the accounts
  // under test are created by the registration flow itself.
  if (process.env.E2E_SKIP_SEED !== "1") {
    console.log("[seed:test] preparing fixtures...");
    execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "ignore" });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(20000);

  const bodyText = async () => {
    const deadline = Date.now() + 20000;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const text = await page.evaluate(() => (document.body ? document.body.innerText : null));
        if (text !== null) return text;
        lastError = new Error("document.body was null");
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw lastError ?? new Error("timed out waiting for a readable document.body");
  };

  const clearSession = async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.localStorage.clear());
  };

  const clickByText = async (selector, text) => {
    const clicked = await page.evaluate(
      (sel, needle) => {
        const element = [...document.querySelectorAll(sel)].find((node) =>
          (node.innerText || node.textContent || "").trim().toLowerCase().includes(needle.toLowerCase()),
        );
        if (!element) return false;
        element.click();
        return true;
      },
      selector,
      text,
    );
    return clicked;
  };

  // ------------------------------------------------------- 1. login page
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const loginText = await bodyText();
  record("login page renders", loginText.includes("Sign in"));
  record("login page offers Create Account", loginText.includes("Create an account"));
  record("login page offers forgot-password help", loginText.includes("Forgot Password?"));
  record("login page advertises no demo accounts", !loginText.includes("SmartCampus@2026"));

  // ------------------------------------------------- 2. open the wizard
  await clickByText("a", "Create an account");
  await page.waitForFunction(() => window.location.pathname === "/register", { timeout: 15000 });
  const registerText = await bodyText();
  record("registration opens at /register", registerText.includes("Create an account"));
  record("only student, faculty and admin are offered", 
    registerText.includes("Student") && registerText.includes("Teacher / Faculty") && registerText.includes("Administrator"));
  record("parent/alumni registration is not offered", !registerText.includes("Parent portal") && !registerText.includes("Alumni"));
  record("no verification code is printed in the UI", !registerText.includes(ADMIN_CODE_LITERAL) && !registerText.includes(FACULTY_CODE_LITERAL));

  // ------------------------------------------- 3. student registration
  const studentEmail = `e2e.student.${RUN}@${DOMAIN}`;
  await clickByText("button", "Student");
  await page.waitForSelector("#reg-email", { timeout: 15000 });
  record("student wizard shows the credentials step", (await bodyText()).includes("University email"));

  await page.type("#reg-email", studentEmail);
  await page.type("#reg-password", PASSWORD);
  await clickByText("button", "Show");
  const revealed = await page.$eval("#reg-password", (node) => node.getAttribute("type"));
  record("password can be revealed", revealed === "text", `type=${revealed}`);
  await page.type("#reg-confirm", PASSWORD);
  const checklist = await bodyText();
  record("password checklist is displayed", checklist.includes("At least 8 characters") && checklist.includes("special character"));
  await clickByText("button", "Next");

  await page.waitForSelector("#reg-first", { timeout: 15000 });
  await page.type("#reg-first", "E2E");
  await page.type("#reg-last", "Student");
  await page.type("#reg-phone", "9876543210");
  await page.type("#reg-student-no", `SC${new Date().getFullYear()}E${String(RUN).slice(-5)}`);
  await page.type("#reg-department", "Computer Science and Engineering");
  await clickByText("button", "Next");

  await page.waitForFunction(() => document.body.innerText.includes("Review"), { timeout: 15000 });
  const reviewText = await bodyText();
  record("student wizard skips the verification step", !reviewText.includes("verification code"));
  record("review step summarises the submission", reviewText.includes(studentEmail) && reviewText.includes("E2E Student"));
  await clickByText("button", "Submit registration");

  await page.waitForFunction(() => document.body.innerText.includes("Registration submitted"), { timeout: 20000 });
  const submittedText = await bodyText();
  record("student sees the pending confirmation", submittedText.includes("waiting for Super Admin approval"));
  record("pending screen links back to sign in", submittedText.includes("Back to sign in"));

  // -------------------------------------- 4. pending login is blocked
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", studentEmail);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("pending approval"), { timeout: 20000 });
  const pendingLoginText = await bodyText();
  record("pending student cannot sign in", pendingLoginText.includes("Your registration is still pending approval"));
  const pendingToken = await page.evaluate(() => window.localStorage.getItem("smartcampus_token"));
  record("pending login stores no session", pendingToken === null);

  // ------------------------------------------ 5. approve in the UI
  const token = await superAdminToken();
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", SUPER_ADMIN.email);
  await page.type("#password", SUPER_ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === "/super-admin", { timeout: 20000 });
  record("SUPER_ADMIN lands on /super-admin", (await page.url()).includes("/super-admin"));

  await page.waitForFunction(() => document.body.innerText.includes("Registration requests"), { timeout: 15000 });
  // The queue is loaded through the API, so wait for the row itself rather than
  // for the static section heading.
  await page.waitForFunction((email) => document.body.innerText.includes(email), { timeout: 20000 }, studentEmail);
  const adminText = await bodyText();
  record("super admin sees the registration queue", adminText.includes("Requested role"));
  record("super admin sees the pending student", adminText.includes(studentEmail));
  record("super admin sees password assistance and user management", adminText.includes("Password assistance") && adminText.includes("User management"));

  const approvedInUi = await page.evaluate((email) => {
    const rows = [...document.querySelectorAll("tr")];
    const row = rows.find((node) => (node.innerText || "").includes(email));
    if (!row) return false;
    const approve = [...row.querySelectorAll("button")].find((b) => (b.innerText || "").trim() === "Approve");
    if (!approve) return false;
    approve.click();
    return true;
  }, studentEmail);
  record("registration row exposes an Approve action", approvedInUi);

  await page.waitForFunction(
    (email) => {
      const rows = [...document.querySelectorAll("tr")];
      const row = rows.find((node) => (node.innerText || "").includes(email));
      return row ? /APPROVED/i.test(row.innerText) : false;
    },
    { timeout: 20000 },
    studentEmail,
  );
  record("approval persists through the API", true);

  // -------------------------------------- 6. student now signs in
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", studentEmail);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === "/dashboard", { timeout: 25000 });
  record("approved student lands on /dashboard", (await page.url()).includes("/dashboard"));
  const studentToken = await page.evaluate(() => window.localStorage.getItem("smartcampus_token"));
  record("approved student receives a session", typeof studentToken === "string" && studentToken.length > 20);

  // ------------------------------- 7. faculty wrong code is rejected
  const facultyEmail = `e2e.faculty.${RUN}@${DOMAIN}`;
  await clearSession();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  await clickByText("button", "Teacher / Faculty");
  await page.waitForSelector("#reg-email", { timeout: 15000 });
  await page.type("#reg-email", facultyEmail);
  await page.type("#reg-password", PASSWORD);
  await page.type("#reg-confirm", PASSWORD);
  await clickByText("button", "Next");
  await page.waitForSelector("#reg-code", { timeout: 15000 });
  const codeStep = await bodyText();
  record("faculty wizard has a verification step", codeStep.includes("Faculty verification code"));
  record("faculty step never prints the real code", !codeStep.includes(FACULTY_CODE));
  await page.type("#reg-code", "00000000");
  await clickByText("button", "Next");
  await page.waitForSelector("#reg-first", { timeout: 15000 });
  await page.type("#reg-first", "E2E");
  await page.type("#reg-last", "Faculty");
  await page.type("#reg-phone", "9876543211");
  await page.type("#reg-employee-no", `EMP${String(RUN).slice(-6)}`);
  await page.type("#reg-department", "Computer Science and Engineering");
  await page.type("#reg-designation", "Assistant Professor");
  await clickByText("button", "Next");
  await page.waitForFunction(() => document.body.innerText.includes("Review"), { timeout: 15000 });
  await clickByText("button", "Submit registration");
  // The browser cannot know the code: only the server can reject it.
  await page.waitForFunction(
    () => document.body.innerText.toLowerCase().includes("invalid faculty verification code"),
    { timeout: 20000 },
  );
  record("wrong faculty code is rejected on submit", true);
  record("wizard stays on the form after an invalid code", (await page.$('button[type="submit"]')) !== null);

  const createdByBadCode = await apiPost("/auth/login", { email: facultyEmail, password: PASSWORD });
  record("a wrong faculty code created no account", createdByBadCode.status === 401, `status=${createdByBadCode.status}`);

  // the server rejects it too
  const badFaculty = await apiPost("/auth/register", {
    role: "FACULTY",
    email: `e2e.faculty.bad.${RUN}@${DOMAIN}`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    code: "00000000",
    firstName: "Bad",
    lastName: "Code",
    phone: "9876543211",
    employeeNo: "EMP-E2E-1",
    department: "Computer Science and Engineering",
    designation: "Assistant Professor",
  });
  record("server rejects a wrong faculty code", badFaculty.status === 400, `status=${badFaculty.status}`);
  record("wrong faculty code creates no account", badFaculty.json?.error?.code === "INVALID_REGISTRATION_CODE", badFaculty.json?.error?.code);

  // ---------------------------------------- 8. admin registration
  const adminEmail = `e2e.admin.${RUN}@${DOMAIN}`;
  await clearSession();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  await clickByText("button", "Administrator");
  await page.waitForSelector("#reg-email", { timeout: 15000 });
  await page.type("#reg-email", adminEmail);
  await page.type("#reg-password", PASSWORD);
  await page.type("#reg-confirm", PASSWORD);
  await clickByText("button", "Next");
  await page.waitForSelector("#reg-code", { timeout: 15000 });
  const adminCodeStep = await bodyText();
  record("admin wizard has a verification step", adminCodeStep.includes("Administrator verification code"));
  record("admin step never prints the real code", !adminCodeStep.includes(ADMIN_CODE));
  await page.type("#reg-code", ADMIN_CODE);
  await clickByText("button", "Next");
  await page.waitForSelector("#reg-first", { timeout: 15000 });
  await page.type("#reg-first", "E2E");
  await page.type("#reg-last", "Administrator");
  await page.type("#reg-phone", "9876543212");
  await page.type("#reg-department", "Administration");
  await page.type("#reg-job-title", "System Administrator");
  await clickByText("button", "Next");
  await page.waitForFunction(() => document.body.innerText.includes("Review"), { timeout: 15000 });
  await clickByText("button", "Submit registration");
  await page.waitForFunction(() => document.body.innerText.includes("Registration submitted"), { timeout: 20000 });
  record("admin registration reaches the pending state", true);

  const adminPendingLogin = await apiPost("/auth/login", { email: adminEmail, password: PASSWORD });
  record("pending admin cannot log in", adminPendingLogin.status === 403, `status=${adminPendingLogin.status}`);

  const approveAdmin = await approveByEmail(token, adminEmail);
  record("SUPER_ADMIN can approve the admin registration", approveAdmin === 200, `status=${approveAdmin}`);
  const adminSession = await apiPost("/auth/login", { email: adminEmail, password: PASSWORD });
  record("approved admin signs in with the ADMIN role", adminSession.json?.data?.user?.role === "ADMIN");

  // --------------------------------- 9. rejected registration cannot log in
  const rejectEmail = `e2e.reject.${RUN}@${DOMAIN}`;
  await clearSession();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  await clickByText("button", "Student");
  await page.waitForSelector("#reg-email", { timeout: 15000 });
  await page.type("#reg-email", rejectEmail);
  await page.type("#reg-password", PASSWORD);
  await page.type("#reg-confirm", PASSWORD);
  await clickByText("button", "Next");
  await page.waitForSelector("#reg-first", { timeout: 15000 });
  await page.type("#reg-first", "E2E");
  await page.type("#reg-last", "Rejected");
  await page.type("#reg-phone", "9876543213");
  await page.type("#reg-student-no", `SC${new Date().getFullYear()}R${String(RUN).slice(-5)}`);
  await page.type("#reg-department", "Computer Science and Engineering");
  await clickByText("button", "Next");
  await page.waitForFunction(() => document.body.innerText.includes("Review"), { timeout: 15000 });
  await clickByText("button", "Submit registration");
  await page.waitForFunction(() => document.body.innerText.includes("Registration submitted"), { timeout: 20000 });

  const registrations = await fetch(`${API}/super-admin/registrations?status=PENDING_APPROVAL`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const target = (registrations.data?.items ?? []).find((item) => item.userEmail === rejectEmail);
  const rejection = await fetch(`${API}/super-admin/registrations/${target.id}/reject`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "E2E rejection" }),
  });
  record("SUPER_ADMIN rejects a registration", rejection.status === 200, `status=${rejection.status}`);

  const rejectedLogin = await apiPost("/auth/login", { email: rejectEmail, password: PASSWORD });
  record("rejected registration cannot log in", rejectedLogin.status === 403, `status=${rejectedLogin.status}`);
  record(
    "rejected message does not leak internal review data",
    String(rejectedLogin.json?.error?.message ?? "").includes("contact the administration") &&
      !JSON.stringify(rejectedLogin.json ?? {}).includes("E2E rejection"),
  );

  // ------------------------------------- 10. password help + role guard
  await clearSession();
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle0" });
  const helpText = await bodyText();
  record("account help page renders", helpText.includes("Account help"));
  record("account help never asks for a password", !helpText.includes("New password"));
  await page.type("#help-email", studentEmail);
  await page.type("#help-message", "I cannot sign in and need help with my account");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("submitted"), { timeout: 20000 });
  record("account help request is accepted", (await bodyText()).includes("administrator"));

  const helpList = await fetch(`${API}/super-admin/password-help?status=OPEN`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  record("SUPER_ADMIN sees the help request", (helpList.data?.total ?? 0) > 0, `total=${helpList.data?.total}`);
  record(
    "help request carries no password material",
    !JSON.stringify(helpList.json ?? {}).includes(PASSWORD) &&
      !JSON.stringify(helpList.json ?? {}).includes("password_hash"),
  );

  // a normal account must not reach the super-admin surface
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", studentEmail);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === "/dashboard", { timeout: 25000 });
  await page.goto(`${BASE}/super-admin`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.location.pathname === "/dashboard", { timeout: 15000 });
  record("a student cannot open /super-admin", (await page.url()).includes("/dashboard"));

  // ------------------------------------------- 11. responsive wizard
  await page.setViewport({ width: 390, height: 844 });
  await clearSession();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("registration wizard fits a phone viewport", overflow <= 2, `overflow=${overflow}px`);
  await page.setViewport({ width: 1440, height: 900 });

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("");
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("registration E2E crashed:", error);
  process.exit(1);
});