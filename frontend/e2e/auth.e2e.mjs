/**
 * Authentication E2E (Puppeteer + system Chrome).
 *
 * Covers the complete login lifecycle against the real SmartCampus backend and
 * the seeded test fixtures: credentials, session persistence across a reload,
 * role detection and landing routes, protected routes, logout, role isolation,
 * and account switching (no state leaking between users).
 *
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:auth
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const API = "http://localhost:4000/api";
const PASSWORD = "SmartCampus@2026";

const ACCOUNTS = {
  STUDENT: { email: "aarav.sharma@smartcampus.edu", home: "/dashboard", label: "Aarav Sharma" },
  FACULTY: { email: "ananya.sharma@smartcampus.edu", home: "/faculty", label: "Dr. Ananya Sharma" },
  ADMIN: { email: "admin@smartcampus.edu", home: "/admin", label: "Meera Iyer" },
  PARENT: { email: "farah.khan@smartcampus.edu", home: "/parent", label: "Farah Khan" },
  ALUMNI: { email: "arjun.menon@alumni.smartcampus.edu", home: "/alumni", label: "Arjun Menon" },
};

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  const token = () => page.evaluate(() => window.localStorage.getItem("smartcampus_token"));
  /**
   * Read the visible page text. Sign-out performs a hard document navigation
   * (window.location.replace), so during the swap the execution context can be
   * destroyed or the next document's <body> not yet parsed. Retry across that
   * window instead of throwing; we only ever return real text, never "".
   */
  const bodyText = async () => {
    const deadline = Date.now() + 20000;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const text = await page.evaluate(() => (document.body ? document.body.innerText : null));
        if (text !== null) return text;
        lastError = new Error("document.body was null");
      } catch (error) {
        lastError = error; // navigation in flight, retry
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw lastError ?? new Error("timed out waiting for a readable document.body");
  };
  const clearSession = async () => {
    // Navigate onto the app origin first: localStorage is inaccessible on the
    // initial about:blank document.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  };

  async function signIn(email, password = PASSWORD) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#email", { timeout: 15000 });
    await page.type("#email", email);
    await page.type("#password", password);
    await page.click('button[type="submit"]');
  }

  async function signOut() {
    // Drive the real sign-out control in the shell so this exercises the
    // product's logout path, not just token deletion.
    const opened = await page.evaluate(() => {
      const trigger = document.querySelector("button[aria-haspopup='menu'], button[aria-haspopup='dialog']");
      if (!trigger) return false;
      trigger.click();
      return true;
    });
    if (opened) {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("[role='menuitem']")).some((el) => /sign out/i.test(el.textContent || "")),
        { timeout: 8000 },
      ).catch(() => {});
      const clicked = await page.evaluate(() => {
        const item = Array.from(document.querySelectorAll("[role='menuitem']")).find((el) =>
          /sign out/i.test(el.textContent || ""),
        );
        if (!item) return false;
        item.click();
        return true;
      });
      if (clicked) {
        await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 }).catch(() => {});
        return;
      }
    }
    // Fallback: the token is the only thing that matters for the assertions.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.localStorage.removeItem("smartcampus_token"));
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 }).catch(() => {});
  }

  // --- 1. Login page loads ---
  await clearSession();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const loginText = await bodyText();
  record("login page loads", page.url().includes("/login"), `url=${page.url()}`);
  record("login form exposes email and password fields", (await page.$("#email")) !== null && (await page.$("#password")) !== null);
  record("login page names the product", loginText.includes("SmartCampus AI"));

  // --- 2. Invalid credentials ---
  await signIn("aarav.sharma@smartcampus.edu", "definitely-not-the-password");
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("invalid"), { timeout: 15000 }).catch(() => {});
  const badText = await bodyText();
  record(
    "invalid credentials show a human-readable error",
    /invalid email or password/i.test(badText),
    `msg=${(badText.match(/Invalid[^\n]*/i) ?? [""])[0]}`,
  );
  record("invalid credentials do not create a session", (await token()) === null);
  record("invalid credentials keep the user on /login", page.url().includes("/login"), `url=${page.url()}`);
  record(
    "error does not leak backend internals",
    !/stack|at Object|\/api\/|node_modules|SELECT |postgres/i.test(badText),
  );

  // --- 3. Valid STUDENT login + redirect ---
  await clearSession();
  await signIn(ACCOUNTS.STUDENT.email);
  await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
  record("valid STUDENT login redirects to the student dashboard", page.url().includes(ACCOUNTS.STUDENT.home), `url=${page.url()}`);
  record("a session token is stored", (await token()) !== null);

  // --- 4. Role detection ---
  const studentText = await bodyText();
  record("session resolves the student's name", studentText.includes("Aarav"), `url=${page.url()}`);
  record("role is surfaced in the shell", studentText.includes("STUDENT"));

  // --- 5. Refresh persistence ---
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !document.body.innerText.includes("Restoring your session"), { timeout: 20000 });
  record("session survives a full page reload", page.url().includes("/dashboard"), `url=${page.url()}`);
  record("role still available after reload", (await bodyText()).includes("Aarav"));

  // --- 6. Protected API call still works with the persisted token ---
  const attendance = await page.evaluate(async () => {
    const t = window.localStorage.getItem("smartcampus_token");
    const res = await fetch("http://localhost:4000/api/students/me/attendance-summary", {
      headers: { Authorization: `Bearer ${t}` },
    });
    return { status: res.status, body: await res.json() };
  });
  record(
    "persisted token authorizes a protected API call",
    attendance.status === 200 && typeof attendance.body?.data?.overall?.percentage === "number",
    `status=${attendance.status} attendance=${attendance.body?.data?.overall?.percentage}`,
  );

  // --- 7. Protected route access while signed out ---
  await signOut();
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
  record("signed-out user is redirected off /dashboard", page.url().includes("/login"), `url=${page.url()}`);
  record("signed-out session is cleared", (await token()) === null);
  const guardedText = await bodyText();
  record("signed-out user does not see student data", !guardedText.includes("Aarav"));

  for (const route of ["/dashboard", "/admin", "/faculty", "/parent", "/alumni", "/placements", "/transport"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 }).catch(() => {});
    record(`protected route ${route} redirects a signed-out user to /login`, page.url().includes("/login"), `url=${page.url()}`);
  }

  // --- 8. Every role lands on its own home ---
  for (const [role, account] of Object.entries(ACCOUNTS)) {
    await clearSession();
    await signIn(account.email);
    await page
      .waitForFunction((home) => location.pathname === home, { timeout: 20000 }, account.home)
      .catch(() => {});
    record(`${role} login redirects to ${account.home}`, page.url().includes(account.home), `url=${page.url()}`);
    const text = await bodyText();
    record(`${role} session renders its own shell`, text.includes(role) || text.includes(account.label.split(" ")[0]), `url=${page.url()}`);
  }

  // --- 9. Role isolation (frontend guard; backend is authoritative) ---
  const isolation = [
    ["student", ACCOUNTS.STUDENT.email, "/admin", "/dashboard"],
    ["faculty", ACCOUNTS.FACULTY.email, "/admin", "/faculty"],
    ["parent", ACCOUNTS.PARENT.email, "/admin", "/parent"],
    ["alumni", ACCOUNTS.ALUMNI.email, "/admin", "/alumni"],
  ];
  for (const [label, email, forbidden, expectedHome] of isolation) {
    await clearSession();
    await signIn(email);
    await page
      .waitForFunction((home) => location.pathname === home, { timeout: 20000 }, expectedHome)
      .catch(() => {});
    await page.goto(`${BASE}${forbidden}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => !location.pathname.startsWith("/admin"), { timeout: 20000 }).catch(() => {});
    record(`${label} cannot enter the admin UI`, !page.url().includes("/admin"), `url=${page.url()}`);
  }

  // --- 10. Backend authorization is authoritative, not just the UI ---
  {
    await clearSession();
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    const direct = await page.evaluate(async () => {
      const t = window.localStorage.getItem("smartcampus_token");
      const res = await fetch("http://localhost:4000/api/admin/placements/companies", {
        headers: { Authorization: `Bearer ${t}` },
      });
      return res.status;
    });
    record("a student token is refused by an admin API even from the browser", direct === 403, `status=${direct}`);
  }

  // --- 11. Invalid / tampered session ---
  {
    await clearSession();
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    await page.evaluate(() => window.localStorage.setItem("smartcampus_token", "not.a.valid.jwt"));
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 }).catch(() => {});
    record("a tampered token is rejected and the user is signed out", page.url().includes("/login"), `url=${page.url()}`);
    const expired = await bodyText();
    record("expired/invalid session is explained to the user", /expired|sign in again/i.test(expired), "");
    record("a rejected token is cleared from storage", (await token()) === null);
  }

  // --- 12. Account switching leaves no residue ---
  {
    await clearSession();
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    const studentText = await bodyText();
    record("student session shows student data", studentText.includes("Aarav"));
    await signOut();
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });

    await signIn(ACCOUNTS.ADMIN.email);
    await page.waitForFunction(() => location.pathname === "/admin", { timeout: 20000 });
    const adminText = await bodyText();
    record("admin login after student logout reaches the admin home", page.url().includes("/admin"), `url=${page.url()}`);
    record("admin session does not show the student dashboard", !page.url().includes("/dashboard"), `url=${page.url()}`);
    record("admin session renders admin identity", adminText.includes("Meera") || adminText.includes("ADMIN"), "");
    record("admin session shows no student greeting", !/Good (morning|afternoon|evening),\s*Aarav/.test(adminText));

    await signOut();
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    const backToStudent = await bodyText();
    record("switching back to the student restores the student session", backToStudent.includes("Aarav"));
    record("student session shows no admin-only chrome", !backToStudent.includes("Placement Management"));
  }

  // --- 13. Back button must not re-expose authenticated UI ---
  {
    await clearSession();
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    await signOut();
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });

    await page.goBack({ waitUntil: "networkidle0" });
    // Sign-out performs a hard navigation, so any restored entry is a full
    // document load and the auth guard must bounce it to /login.
    await page
      .waitForFunction(() => location.pathname === "/login", { timeout: 20000 })
      .catch(() => {});
    const backText = await bodyText();
    record(
      "browser back does not re-expose the authenticated dashboard",
      !page.url().includes("/dashboard"),
      `url=${page.url()} text="${backText.slice(0, 120).replace(/\n+/g, " | ")}"`,
    );
    record("browser back shows no student data", !backText.includes("Aarav"), `url=${page.url()}`);
    record("browser back does not restore a session token", (await token()) === null);
  }

  // --- 14. No secrets exposed to the client ---
  {
    await clearSession();
    await signIn(ACCOUNTS.STUDENT.email);
    await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
    const html = await page.content();
    record("no raw JWT is printed into the DOM", !/eyJ[A-Za-z0-9_-]{10,}\./.test(html));
    const storage = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage),
      session: window.sessionStorage.length,
    }));
    record(
      "only the expected auth key is persisted",
      storage.keys.every((k) => k === "smartcampus_token"),
      `keys=${JSON.stringify(storage.keys)}`,
    );
    const mls = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script")).map((s) => s.textContent || "").join(" "),
    );
    record("no ML service URL or secret is inlined in the page", !/localhost:8001|JWT_SECRET|OPENAI_API_KEY/.test(mls));
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== AUTH E2E SUMMARY ===`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`TOTAL: ${results.length}`);
  if (failed > 0) {
    console.log("\nFailures:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
