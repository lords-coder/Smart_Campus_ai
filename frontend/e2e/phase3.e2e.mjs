/**
 * Phase 3 end-to-end tests (Puppeteer + system Chrome).
 * Coverage: admin timetable register (create, conflict feedback, edit,
 * archive, restore, filters), faculty read-only timetable, student schedule,
 * role guards and the timetable API authorization rules.
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase3   (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

// Synthetic click: a real mouse click can be swallowed while a closing modal
// still locks body pointer-events.
async function clickEl(page, selector) {
  return page.$eval(selector, (el) => {
    if (!el) return false;
    if (el.disabled) return false;
    el.click();
    return true;
  });
}

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

/** Modal dialogs (and their close animation) lock body pointer events. */
async function settle(page) {
  await waitFor(page, () => {
    if (document.querySelector('[role="dialog"]')) return false;
    if (document.body.style.pointerEvents === "none") return false;
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
}

/** Opens a shadcn/radix Select and picks an option with a real mouse click. */
async function selectOption(page, selector, optionText) {
  await settle(page);
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    await page.click(selector);
    opened = await waitFor(page, () => document.querySelectorAll('[role="option"]').length > 0, 3000);
    if (!opened) {
      // Fallback: synthetic pointer sequence (survives an overlay or pointer-events lock).
      await page.$eval(selector, (el) => {
        const pointer = (type) =>
          el.dispatchEvent(
            new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }),
          );
        pointer("pointerdown");
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        pointer("pointerup");
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      opened = await waitFor(page, () => document.querySelectorAll('[role="option"]').length > 0, 5000);
    }
  }
  if (!opened) return false;

  const ready = await waitFor(
    page,
    (value) => [...document.querySelectorAll('[role="option"]')].some((el) => (el.textContent || "").includes(value)),
    15000,
    optionText,
  );
  if (!ready) return false;
  const handles = await page.$$('[role="option"]');
  for (const handle of handles) {
    const text = await handle.evaluate((el) => el.textContent || "");
    if (text.includes(optionText)) {
      await handle.click();
      return true;
    }
  }
  return false;
}

const clickInDialog = (page, heading, buttonText) =>
  page.evaluate(
    (title, label) => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
        (node) => (node.textContent || "").includes(title),
      );
      if (!dialog) return false;
      const node = [...dialog.querySelectorAll("button")].find(
        (button) => (button.textContent || "").trim() === label,
      );
      if (node) {
        node.click();
        return true;
      }
      return false;
    },
    heading,
    buttonText,
  );

const clickRowButton = (page, room, label) =>
  page.evaluate(
    (roomValue, buttonLabel) => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      const row = rows.find((r) => (r.textContent || "").includes(roomValue));
      const node = row
        ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === buttonLabel)
        : null;
      if (node) {
        node.click();
        return true;
      }
      return false;
    },
    room,
    label,
  );

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const uiDay = () => {
  const name = DAY_NAMES[new Date().getDay()];
  return name === "Sunday" ? "Monday" : name;
};

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

  const suffix = String(Date.now()).slice(-4);
  const roomCreated = `L-7${suffix}`;
  const roomEdited = `L-9${suffix}`;
  const day = uiDay();

  // =====================================================================
  // 1. ADMIN - timetable register, create, conflicts, edit, archive
  // =====================================================================
  await login(page, "admin@smartcampus.edu");
  record("admin lands on fee management", page.url().includes("/admin"), page.url());

  const adminNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("admin nav links to timetable", adminNav.some((label) => label.includes("Timetable")), JSON.stringify(adminNav));

  await page.goto(`${BASE}/admin/timetable`, { waitUntil: "networkidle2" });
  const registerLoaded = await waitFor(page, () => document.body.innerText.includes("CS301"));
  record("admin timetable register loads", registerLoaded);
  let text = await bodyText(page);
  record("register shows the seeded week", text.includes("Timetable Management"), text.slice(0, 60).replace(/\n/g, " "));
  record("register reports the entry count", /30 entries/.test(text), (text.match(/\d+ entries/) || [""])[0]);

  await clickEl(page, "#tt-new");
  const createOpen = await waitFor(page, () =>
    [...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Add a class")),
  );
  record("create dialog opens", createOpen);
  await fillInput(page, "#tt-room", roomCreated);
  await fillInput(page, "#tt-start", "17:00");
  await fillInput(page, "#tt-end", "18:00");
  await clickEl(page, "#tt-submit");
  const createdToast = await waitFor(page, () => document.body.innerText.includes("Timetable entry created"));
  const dialogClosed = await waitFor(page, () =>
    ![...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Add a class")),
  );
  text = await bodyText(page);
  record("admin creates a class", createdToast && dialogClosed, (text.match(/Timetable entry created[^\n]*/) || [""])[0]);
  record("new class appears in the register", text.includes(roomCreated), roomCreated);

  // Same slot again -> server-side room conflict must be shown inline.
  await clickEl(page, "#tt-new");
  await waitFor(page, () =>
    [...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Add a class")),
  );
  await fillInput(page, "#tt-room", roomCreated);
  await fillInput(page, "#tt-start", "17:00");
  await fillInput(page, "#tt-end", "18:00");
  await clickEl(page, "#tt-submit");
  const conflictShown = await waitFor(page, () => document.body.innerText.includes("Scheduling conflict"));
  text = await bodyText(page);
  record("duplicate slot shows conflict feedback", conflictShown);
  record("conflict names the clashing room", text.includes("ROOM") && text.includes(roomCreated), (text.match(/ROOM:[^\n]*/) || [""])[0]);
  record("conflict keeps the dialog open", text.includes("Add a class"));
  await clickInDialog(page, "Add a class", "Cancel");
  const createClosed = await waitFor(page, () =>
    ![...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Add a class")),
  );
  record("conflict dialog can be dismissed", createClosed);

  // Edit the row.
  await settle(page);
  const editClicked = await clickRowButton(page, roomCreated, "Edit");
  const editOpen = await waitFor(page, () =>
    [...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Edit timetable entry")),
  );
  const dialogsOpen = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
  record("edit dialog opens for the new class", editClicked && editOpen && dialogsOpen === 1, `${dialogsOpen} dialog(s)`);
  await fillInput(page, "#tt-room", roomEdited);
  await clickEl(page, "#tt-submit");
  const updatedToast = await waitFor(page, () => document.body.innerText.includes("Timetable entry updated"));
  text = await bodyText(page);
  record("edit saves and refreshes the register", updatedToast && text.includes(roomEdited), roomEdited);

  // Archive from the row menu.
  await settle(page);
  const archiveClicked = await clickRowButton(page, roomEdited, "Archive");
  const archiveOpen = await waitFor(page, () =>
    [...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent || "").includes("Remove timetable entry")),
  );
  const archiveDialogText = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      (d.textContent || "").includes("Remove timetable entry"),
    );
    return dialog ? dialog.textContent || "" : "";
  });
  record("archive dialog opens", archiveClicked && archiveOpen);
  record(
    "archive dialog explains attendance safety",
    archiveDialogText.includes("attendance history") || archiveDialogText.includes("attendance records"),
    archiveDialogText.slice(0, 80).replace(/\s+/g, " "),
  );
  const permanentDisabled = await page.evaluate(() => {
    const button = document.querySelector("#tt-delete-permanent");
    return button ? button.disabled === true : false;
  });
  record("permanent delete is blocked while history exists", permanentDisabled);
  await clickEl(page, "#tt-archive");
  const archivedToast = await waitFor(page, () => document.body.innerText.includes("Timetable entry archived"));
  const goneFromActive = await waitFor(
    page,
    (room) => ![...document.querySelectorAll("table tbody tr")].some((r) => (r.textContent || "").includes(room)),
    15000,
    roomEdited,
  );
  record("archived class leaves the active register", archivedToast && goneFromActive);

  // Status filter -> archived view, then restore.
  const pickedArchived = await selectOption(page, "#tt-status-filter", "Archived");
  record("status filter switches to archived", pickedArchived);
  const visibleInArchive = await waitFor(
    page,
    (room) => [...document.querySelectorAll("table tbody tr")].some((r) => (r.textContent || "").includes(room)),
    15000,
    roomEdited,
  );
  record("archived class appears in the archive view", visibleInArchive);
  await settle(page);
  const restoreClicked = await clickRowButton(page, roomEdited, "Restore");
  const restoredToast = await waitFor(page, () => document.body.innerText.includes("Timetable entry restored"));
  record("archived class can be restored", restoreClicked && restoredToast);

  // Back to the active view and use the room search filter.
  const pickedActive = await selectOption(page, "#tt-status-filter", "Active");
  record("status filter switches back to active", pickedActive);
  const backInActive = await waitFor(
    page,
    (room) => [...document.querySelectorAll("table tbody tr")].some((r) => (r.textContent || "").includes(room)),
    15000,
    roomEdited,
  );
  record("restored class is listed in the active view", backInActive, roomEdited);

  await fillInput(page, "#tt-room-filter", roomEdited);
  // Scoped to the page container: the global shell has its own "Search pages"
  // control, and this helper matches on a substring.
  await clickByText(".page-surface button", "Search")(page);
  const filtered = await waitFor(
    page,
    (room) => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      return rows.length > 0 && rows.every((r) => (r.textContent || "").includes(room));
    },
    15000,
    roomEdited,
  );
  record("room search narrows the register", filtered, roomEdited);
  await clickByText("button", "Clear")(page);
  await waitFor(page, (room) => [...document.querySelectorAll("table tbody tr")].some((r) => (r.textContent || "").includes(room)), 15000, roomEdited);

  // =====================================================================
  // 2. FACULTY - read-only timetable
  // =====================================================================
  await login(page, "ananya.sharma@smartcampus.edu");
  record("faculty lands on attendance management", page.url().includes("/faculty"), page.url());

  const facultyNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record("faculty nav links to timetable", facultyNav.some((label) => label.includes("Timetable")), JSON.stringify(facultyNav));

  await page.goto(`${BASE}/faculty/timetable`, { waitUntil: "networkidle2" });
  const facultyLoaded = await waitFor(page, () => document.body.innerText.includes("My Timetable"));
  text = await bodyText(page);
  record("faculty timetable loads", facultyLoaded);
  record(
    "faculty sees weekly stats",
    text.includes("Classes this week") && text.includes("Rooms in use"),
  );
  record("faculty timetable is read-only", !text.includes("New class") && !text.includes("Archive"));

  // Today may have no classes for this faculty: open Monday, where CS301 runs.
  await clickByText("button", "Mon")(page);
  const facultyMonday = await waitFor(page, () => document.body.innerText.includes("CS301"));
  text = await bodyText(page);
  record("faculty sees own assigned classes", facultyMonday, (text.match(/CS\d{3}/g) || []).slice(0, 3).join(","));

  // =====================================================================
  // 3. STUDENT - schedule and role guards
  // =====================================================================
  await login(page, "aarav.sharma@smartcampus.edu");
  record("student lands on dashboard", page.url().includes("/dashboard"), page.url());

  const studentNav = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")].map((a) => (a.textContent || "").trim()),
  );
  record(
    "student nav hides admin sections",
    !studentNav.some((label) => label.includes("Fee Management")),
    JSON.stringify(studentNav),
  );

  await page.goto(`${BASE}/timetable`, { waitUntil: "networkidle2" });
  const studentLoaded = await waitFor(page, () => document.body.innerText.includes("Your weekly class schedule"));
  text = await bodyText(page);
  record("student timetable loads", studentLoaded);
  record("student sees section classes", text.includes("Section A") || text.includes("No classes"), (text.match(/Section [A-Z]/g) || [])[0]);

  await page.goto(`${BASE}/admin/timetable`, { waitUntil: "networkidle2" });
  const bounced = await waitFor(page, () => location.pathname !== "/admin/timetable", 15000);
  record("student is bounced from the admin timetable", bounced && page.url().includes("/dashboard"), page.url());

  // =====================================================================
  // 4. API - authorization, conflicts, archive semantics
  // =====================================================================
  const adminToken = await loginApi("admin@smartcampus.edu");
  const facultyTok = await loginApi("ananya.sharma@smartcampus.edu");
  const studentTok = await loginApi("aarav.sharma@smartcampus.edu");

  const studentList = await api("GET", "/timetable", { token: studentTok });
  record("student cannot read the timetable register", studentList.status === 403, `status=${studentList.status}`);

  const studentPost = await api("POST", "/timetable", {
    token: studentTok,
    body: { courseId: "00000000-0000-4000-8000-000000000000", facultyId: "00000000-0000-4000-8000-000000000000", section: "A", room: "L-501", day, startTime: "17:00", endTime: "18:00" },
  });
  record("student cannot create timetable entries", studentPost.status === 403, `status=${studentPost.status}`);

  const facultyPost = await api("POST", "/timetable", {
    token: facultyTok,
    body: { courseId: "00000000-0000-4000-8000-000000000000", facultyId: "00000000-0000-4000-8000-000000000000", section: "A", room: "L-502", day, startTime: "17:00", endTime: "18:00" },
  });
  record("faculty cannot create timetable entries", facultyPost.status === 403, `status=${facultyPost.status}`);

  const options = await api("GET", "/timetable/options", { token: adminToken });
  const ananyaId = (options.json?.data?.faculties ?? []).find((f) => f.name.includes("Ananya"))?.id;
  const cs301 = (options.json?.data?.courses ?? []).find((c) => c.code === "CS301");
  record("admin reads timetable options", options.status === 200 && Boolean(ananyaId && cs301));

  const facultyList = await api("GET", "/timetable", { token: facultyTok });
  record(
    "faculty timetable API returns own classes",
    facultyList.status === 200 &&
      facultyList.json?.data?.total > 0 &&
      (facultyList.json?.data?.entries ?? []).every((e) => e.faculty?.id === ananyaId),
    `total=${facultyList.json?.data?.total}`,
  );

  const facultyScoped = await api("GET", `/timetable?facultyId=${(options.json?.data?.faculties ?? [])[0]?.id}`, { token: facultyTok });
  record(
    "faculty cannot filter onto other classes",
    facultyScoped.status === 200 &&
      (facultyScoped.json?.data?.entries ?? []).every((e) => e.faculty?.id === ananyaId),
    `total=${facultyScoped.json?.data?.total}`,
  );

  // Seeded Monday 09:00 CS301 slot (active, faculty + room + section all taken).
  const clash = await api("POST", "/timetable", {
    token: adminToken,
    body: { courseId: cs301?.id, facultyId: ananyaId, section: "A", room: "L-201", day: "Monday", startTime: "09:00", endTime: "10:00" },
  });
  record(
    "API rejects a clashing slot",
    clash.status === 409 && clash.json?.error?.code === "TIMETABLE_CONFLICT",
    `${clash.status} ${clash.json?.error?.code}`,
  );
  const clashTypes = clash.json?.error?.details?.conflictTypes ?? [];
  record(
    "conflict payload lists faculty, room and section clashes",
    clashTypes.includes("FACULTY") && clashTypes.includes("ROOM") && clashTypes.includes("SECTION"),
    JSON.stringify(clashTypes),
  );

  const mineList = await api("GET", `/timetable?status=ALL&room=${roomEdited}`, { token: adminToken });
  const mine = (mineList.json?.data?.entries ?? []).find((e) => e.room === roomEdited);
  record("created class is findable through the API", Boolean(mine), mine?.id ?? "not found");

  if (mine) {
    const archive = await api("DELETE", `/timetable/${mine.id}`, { token: adminToken });
    record(
      "DELETE archives by default",
      archive.status === 200 && archive.json?.data?.archived === true,
      JSON.stringify(archive.json?.data ?? archive.json?.error),
    );

    const studentDay = await api("GET", `/students/me/timetable?day=${day}`, { token: studentTok });
    record(
      "archived class is hidden from students",
      studentDay.status === 200 && !(studentDay.json?.data?.entries ?? []).some((e) => e.room === roomEdited),
      `total=${studentDay.json?.data?.entries?.length}`,
    );

    const facultyClasses = await api("GET", "/attendance/classes", { token: facultyTok });
    record(
      "archived class is hidden from attendance",
      !(facultyClasses.json?.data?.classes ?? []).some((c) => c.id === mine.id),
      `classes=${facultyClasses.json?.data?.classes?.length}`,
    );

    const permanent = await api("DELETE", `/timetable/${mine.id}?permanent=true`, { token: adminToken });
    record(
      "permanent delete is blocked while attendance exists",
      permanent.status === 409 && permanent.json?.error?.code === "DEPENDENCY_CONFLICT",
      `${permanent.status} ${permanent.json?.error?.code}`,
    );

    const restore = await api("PATCH", `/timetable/${mine.id}`, { token: adminToken, body: { isActive: true } });
    record(
      "admin can restore an archived class",
      restore.status === 200 && restore.json?.data?.entry?.isActive === true,
      `${restore.status}`,
    );

    const studentDayAgain = await api("GET", `/students/me/timetable?day=${day}`, { token: studentTok });
    record(
      "restored class is visible to students again",
      (studentDayAgain.json?.data?.entries ?? []).some((e) => e.room === roomEdited),
      `total=${studentDayAgain.json?.data?.entries?.length}`,
    );
  } else {
    record("DELETE archives by default", false, "created class missing");
    record("archived class is hidden from students", false, "created class missing");
    record("archived class is hidden from attendance", false, "created class missing");
    record("permanent delete is blocked while attendance exists", false, "created class missing");
    record("admin can restore an archived class", false, "created class missing");
    record("restored class is visible to students again", false, "created class missing");
  }

  // =====================================================================
  // 5. CLEANUP - leave the seeded 30 active slots for the other suites
  // =====================================================================
  const everything = await api("GET", "/timetable?status=ALL", { token: adminToken });
  let cleaned = 0;
  for (const entry of everything.json?.data?.entries ?? []) {
    if (/^L-[79]/.test(entry.room)) {
      const res = await api("DELETE", `/timetable/${entry.id}`, { token: adminToken });
      if (res.status === 200) cleaned += 1;
    }
  }
  record("cleanup archives the test classes", cleaned > 0, `${cleaned} archived`);

  const finalList = await api("GET", "/timetable", { token: adminToken });
  record(
    "active register returns to the 30 seeded classes",
    finalList.json?.data?.total === 30,
    `total=${finalList.json?.data?.total}`,
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("----------------------------------------");
  console.log(`P3 E2E PASSED: ${results.length - failed.length}   FAILED: ${failed.length}`);
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
