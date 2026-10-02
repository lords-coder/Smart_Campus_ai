/**
 * Phase 12: Placement Management - E2E (Puppeteer + system Chrome).
 * Coverage: student drives/eligibility/application lifecycle, admin company +
 * drive + application management, the shortlist -> interview -> offer pipeline,
 * analytics, and the authorization matrix (including cross-student IDOR).
 *
 * Seeded fixtures used on purpose:
 *   - karthik.reddy  -> weak standing, eligible for exactly one open drive
 *   - aarav.sharma   -> already APPLIED to an open drive
 *   - diya.krishnan  -> already SELECTED with an offer
 *
 * Prereq: docker compose up -d | backend npm run dev | frontend npm run dev
 * Run:    npm run test:e2e:phase12  (from frontend/; seeds first unless E2E_SKIP_SEED=1)
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

const WEAK = "karthik.reddy@smartcampus.edu";
const STRONG = "aarav.sharma@smartcampus.edu";
const SELECTED = "diya.krishnan@smartcampus.edu";
const PARENT = "farah.khan@smartcampus.edu";
const FACULTY = "ananya.sharma@smartcampus.edu";
const ADMIN = "admin@smartcampus.edu";

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
    console.log("[phase12] Seeding database...");
    try {
      execSync("npm run seed:test", { cwd: BACKEND_DIR, stdio: "inherit" });
    } catch (e) {
      console.error("Seed failed:", e.message);
      process.exit(1);
    }
  }

  const weakToken = await loginApi(WEAK);
  const strongToken = await loginApi(STRONG);
  const selectedToken = await loginApi(SELECTED);
  const parentToken = await loginApi(PARENT);
  const facultyToken = await loginApi(FACULTY);
  const adminToken = await loginApi(ADMIN);
  record("demo accounts can authenticate", Boolean(weakToken && strongToken && selectedToken && parentToken && facultyToken && adminToken));

  // ============================================================== STUDENT side

  // --- 1. Open drives with per-student eligibility ---
  const weakDrives = await api("GET", "/placements/drives", { token: weakToken });
  const weakList = weakDrives.json?.data?.drives ?? [];
  record("GET /placements/drives returns 200", weakDrives.status === 200, `status=${weakDrives.status}`);
  record("open drives are listed for a student", weakList.length > 0, `count=${weakList.length}`);
  record(
    "every drive carries an eligibility verdict",
    weakList.every((d) => typeof d.eligibility?.eligible === "boolean" && Array.isArray(d.eligibility?.reasons)),
  );
  const eligibleDrives = weakList.filter((d) => d.eligibility.eligible);
  const blockedDrives = weakList.filter((d) => !d.eligibility.eligible);
  record("weak student has blocked drives", blockedDrives.length > 0, `blocked=${blockedDrives.length}`);
  record("weak student has at least one eligible drive", eligibleDrives.length > 0, `eligible=${eligibleDrives.length}`);
  record(
    "blocked drives explain why, using real standing numbers",
    blockedDrives.every((d) => d.eligibility.reasons.length > 0 && /CGPA|Backlog|Attendance|department|semester|batch/i.test(d.eligibility.reasons.join(" "))),
    `sample=${blockedDrives[0]?.eligibility?.reasons?.[0] ?? ""}`,
  );
  record(
    "eligible drives come with standing figures",
    eligibleDrives.every((d) => typeof d.eligibility.standing?.cgpa === "number" && typeof d.eligibility.standing?.backlogs === "number"),
  );

  const strongDrives = await api("GET", "/placements/drives", { token: strongToken });
  const strongEligible = (strongDrives.json?.data?.drives ?? []).filter((d) => d.eligibility.eligible).length;
  record("eligibility is computed per student, not shared", strongEligible !== eligibleDrives.length, `strong=${strongEligible} weak=${eligibleDrives.length}`);

  // --- 2. Drive detail + eligibility endpoint ---
  const targetDrive = eligibleDrives[0];
  const eligibility = await api("GET", `/placements/drives/${targetDrive.id}/eligibility`, { token: weakToken });
  record("GET /placements/drives/:id/eligibility returns 200", eligibility.status === 200, `status=${eligibility.status}`);
  record("eligibility detail matches the list verdict", eligibility.json?.data?.eligibility?.eligible === targetDrive.eligibility.eligible);
  const unknownDrive = await api("GET", "/placements/drives/00000000-0000-0000-0000-000000000000/eligibility", { token: weakToken });
  record("unknown drive is rejected", unknownDrive.status === 404, `status=${unknownDrive.status}`);

  // --- 3. Application flow ---
  const apply = await api("POST", `/placements/drives/${targetDrive.id}/apply`, { token: weakToken });
  record("eligible student can apply", apply.status === 201, `status=${apply.status}`);
  const applicationId = apply.json?.data?.id;

  const duplicate = await api("POST", `/placements/drives/${targetDrive.id}/apply`, { token: weakToken });
  record("duplicate application is rejected", duplicate.status === 409, `status=${duplicate.status}`);

  const ineligibleDrive = blockedDrives[0];
  const badApply = await api("POST", `/placements/drives/${ineligibleDrive.id}/apply`, { token: weakToken });
  record("ineligible student cannot apply", badApply.status === 400, `status=${badApply.status}`);
  record(
    "rejection cites the unmet requirement",
    /not eligible/i.test(badApply.json?.error?.message ?? ""),
    `msg=${(badApply.json?.error?.message ?? "").slice(0, 80)}`,
  );

  const weakApps = await api("GET", "/placements/applications", { token: weakToken });
  const weakAppList = weakApps.json?.data?.applications ?? [];
  record("new application shows in My applications", weakAppList.some((a) => a.id === applicationId), `count=${weakAppList.length}`);
  record("new application starts in APPLIED", weakAppList.find((a) => a.id === applicationId)?.status === "APPLIED");
  record(
    "the drive the student applied to is flagged on the drive list",
    (await api("GET", "/placements/drives", { token: weakToken })).json?.data?.drives?.find((d) => d.id === targetDrive.id)?.myApplicationStatus === "APPLIED",
  );

  // --- 4. Cross-student protection (IDOR) ---
  const spyRead = await api("GET", `/placements/applications/${applicationId}`, { token: strongToken });
  record("a student cannot read another student's application", spyRead.status === 404, `status=${spyRead.status}`);
  const spyWithdraw = await api("POST", `/placements/applications/${applicationId}/withdraw`, { token: strongToken });
  record("a student cannot withdraw another student's application", spyWithdraw.status === 404, `status=${spyWithdraw.status}`);
  const stillThere = await api("GET", "/placements/applications", { token: weakToken });
  record(
    "the other student's withdraw attempt changed nothing",
    (stillThere.json?.data?.applications ?? []).some((a) => a.id === applicationId && a.status === "APPLIED"),
  );

  // --- 5. Withdraw, then re-apply (a withdrawn row releases the unique slot) ---
  const withdraw = await api("POST", `/placements/applications/${applicationId}/withdraw`, { token: weakToken });
  record("student can withdraw their own application", withdraw.status === 200, `status=${withdraw.status}`);
  const afterWithdraw = await api("GET", "/placements/applications", { token: weakToken });
  const withdrawnApp = (afterWithdraw.json?.data?.applications ?? []).find((a) => a.id === applicationId);
  record("withdrawn application is reported as WITHDRAWN", withdrawnApp?.status === "WITHDRAWN", `status=${withdrawnApp?.status}`);
  const driveAfterWithdraw = (await api("GET", "/placements/drives", { token: weakToken })).json?.data?.drives?.find((d) => d.id === targetDrive.id);
  record("drive no longer shows an active application after withdrawal", !driveAfterWithdraw?.myApplicationStatus, `status=${driveAfterWithdraw?.myApplicationStatus}`);
  const doubleWithdraw = await api("POST", `/placements/applications/${applicationId}/withdraw`, { token: weakToken });
  record("withdrawing twice is rejected", doubleWithdraw.status === 400 || doubleWithdraw.status === 404, `status=${doubleWithdraw.status}`);

  const reapply = await api("POST", `/placements/drives/${targetDrive.id}/apply`, { token: weakToken });
  record("student can re-apply after withdrawing", reapply.status === 201, `status=${reapply.status}`);
  const pipelineAppId = reapply.json?.data?.id;
  record("re-application is a new record", Boolean(pipelineAppId) && pipelineAppId !== applicationId);

  // --- 6. Closed drive rejects applications ---
  const allDrives = await api("GET", "/admin/placements/drives", { token: adminToken });
  const closedDriveId = (allDrives.json?.data?.items ?? []).find((d) => d.status === "CLOSED")?.id;
  record("seed contains a CLOSED drive", Boolean(closedDriveId));
  if (closedDriveId) {
    const closedApply = await api("POST", `/placements/drives/${closedDriveId}/apply`, { token: strongToken });
    record("closed drive rejects new applications", closedApply.status === 400, `status=${closedApply.status}`);
  }

  // --- 7. Placement history for a selected student ---
  const history = await api("GET", "/placements/history", { token: selectedToken });
  const hist = history.json?.data?.history ?? [];
  record("GET /placements/history returns 200", history.status === 200, `status=${history.status}`);
  record("selected student has placement history", hist.length > 0, `count=${hist.length}`);
  record("history entries carry an offer", hist.some((h) => (h.offers ?? []).length > 0), `offers=${hist[0]?.offers?.length ?? 0}`);
  const unplacedHistory = await api("GET", "/placements/history", { token: weakToken });
  record("a student with no selection has an empty history", (unplacedHistory.json?.data?.history ?? []).length === 0);

  // ================================================================ ADMIN side

  // --- 8. Company management ---
  const companiesBefore = await api("GET", "/admin/placements/companies", { token: adminToken });
  const companyCountBefore = companiesBefore.json?.data?.companies?.length ?? 0;
  record("GET /admin/placements/companies returns 200", companiesBefore.status === 200, `status=${companiesBefore.status}`);
  record("seeded companies are listed", companyCountBefore > 0, `count=${companyCountBefore}`);

  const newCompany = await api("POST", "/admin/placements/companies", {
    token: adminToken,
    body: {
      name: "E2E Verification Industries",
      companyType: "PRODUCT",
      location: "Bengaluru",
      industry: "Software",
      website: "https://example.invalid",
    },
  });
  record("admin can create a company", newCompany.status === 201, `status=${newCompany.status}`);
  const companyId = newCompany.json?.data?.id;

  const badCompany = await api("POST", "/admin/placements/companies", { token: adminToken, body: { name: "" } });
  record("invalid company is rejected", badCompany.status === 400, `status=${badCompany.status}`);

  const patchedCompany = await api("PATCH", `/admin/placements/companies/${companyId}`, {
    token: adminToken,
    body: { location: "Hyderabad" },
  });
  record("admin can update a company", patchedCompany.status === 200, `status=${patchedCompany.status}`);
  record("company update is persisted", patchedCompany.json?.data?.location === "Hyderabad", `location=${patchedCompany.json?.data?.location}`);
  const unknownCompany = await api("PATCH", "/admin/placements/companies/00000000-0000-0000-0000-000000000000", { token: adminToken, body: { location: "Nowhere" } });
  record("updating an unknown company is rejected", unknownCompany.status === 404, `status=${unknownCompany.status}`);

  // --- 9. Drive management, including the DRAFT -> OPEN lifecycle ---
  const drivesBefore = await api("GET", "/admin/placements/drives", { token: adminToken });
  const driveCountBefore = drivesBefore.json?.data?.total ?? 0;
  record("admin drive list includes every status", driveCountBefore > 0, `total=${driveCountBefore}`);

  const newDrive = await api("POST", "/admin/placements/drives", {
    token: adminToken,
    body: {
      companyId,
      title: "E2E Verification Hiring 2026",
      jobRole: "Verification Engineer",
      description: "Created by the Phase 12 end-to-end suite.",
      packageMin: 600000,
      packageMax: 900000,
      openings: 2,
      location: "Hyderabad",
      employmentType: "FULL_TIME",
      workMode: "HYBRID",
      applicationDeadline: "2026-12-31",
      minCgpa: 4,
      maxBacklogs: 4,
      minAttendance: 70,
    },
  });
  record("admin can create a drive", newDrive.status === 201, `status=${newDrive.status}`);
  const newDriveId = newDrive.json?.data?.id;
  record("a newly created drive starts as DRAFT", newDrive.json?.data?.status === "DRAFT", `status=${newDrive.json?.data?.status}`);

  const badDrive = await api("POST", "/admin/placements/drives", {
    token: adminToken,
    body: { companyId, title: "x", jobRole: "y", applicationDeadline: "2026-12-31" },
  });
  record("invalid drive is rejected", badDrive.status === 400, `status=${badDrive.status}`);

  const badCompanyDrive = await api("POST", "/admin/placements/drives", {
    token: adminToken,
    body: { companyId: "00000000-0000-0000-0000-000000000000", title: "Orphan", jobRole: "Nobody", applicationDeadline: "2026-12-31" },
  });
  record("a drive for an unknown company is rejected", badCompanyDrive.status === 404, `status=${badCompanyDrive.status}`);

  const draftVisible = (await api("GET", "/placements/drives", { token: weakToken })).json?.data?.drives?.some((d) => d.id === newDriveId);
  record("a DRAFT drive is hidden from students", draftVisible === false);

  const published = await api("PATCH", `/admin/placements/drives/${newDriveId}`, { token: adminToken, body: { status: "OPEN" } });
  record("admin can publish a drive", published.status === 200 && published.json?.data?.status === "OPEN", `status=${published.json?.data?.status}`);

  const patchedDrive = await api("PATCH", `/admin/placements/drives/${newDriveId}`, { token: adminToken, body: { openings: 5 } });
  record("admin can update a drive", patchedDrive.status === 200, `status=${patchedDrive.status}`);
  record("drive update is persisted", Number(patchedDrive.json?.data?.openings) === 5, `openings=${patchedDrive.json?.data?.openings}`);

  const studentDrivesAfter = (await api("GET", "/placements/drives", { token: weakToken })).json?.data?.drives ?? [];
  record("the published drive appears for students", studentDrivesAfter.some((d) => d.id === newDriveId), `count=${studentDrivesAfter.length}`);
  const newDriveEligibility = await api("GET", `/placements/drives/${newDriveId}/eligibility`, { token: weakToken });
  record(
    "weak student meets the published drive's relaxed rules",
    newDriveEligibility.json?.data?.eligibility?.eligible === true,
    `eligible=${newDriveEligibility.json?.data?.eligibility?.eligible}`,
  );

  // --- 10. Shortlist -> interview -> selection -> offer pipeline ---
  const shortlist = await api("PATCH", `/admin/placements/applications/${pipelineAppId}/shortlist`, { token: adminToken });
  record("admin can shortlist an application", shortlist.status === 200, `status=${shortlist.status}`);
  record("shortlisted application reports SHORTLISTED", shortlist.json?.data?.status === "SHORTLISTED", `status=${shortlist.json?.data?.status}`);

  const earlyOffer = await api("POST", `/admin/placements/applications/${pipelineAppId}/offer`, {
    token: adminToken,
    body: { packageAmount: 700000 },
  });
  record("offer on a non-selected application is rejected", earlyOffer.status === 400, `status=${earlyOffer.status}`);

  const earlyInterview = await api("POST", `/admin/placements/applications/${pipelineAppId}/interviews`, {
    token: adminToken,
    body: { roundName: "Screening", roundNumber: 1, scheduledAt: "2026-11-01T10:00:00.000Z", location: "Room 1" },
  });
  record("an interview is created for a shortlisted application", earlyInterview.status === 201, `status=${earlyInterview.status}`);

  const afterInterview = await api("GET", `/admin/placements/applications/${pipelineAppId}`, { token: adminToken });
  record(
    "scheduling an interview advances the application to INTERVIEW",
    afterInterview.json?.data?.application?.status === "INTERVIEW",
    `status=${afterInterview.json?.data?.application?.status}`,
  );
  record("application detail includes the interview", (afterInterview.json?.data?.application?.interviews ?? []).length === 1, `interviews=${afterInterview.json?.data?.application?.interviews?.length}`);
  record("application detail exposes the student's academic standing", typeof afterInterview.json?.data?.academicStanding?.cgpa === "number");

  const interviewId = earlyInterview.json?.data?.id;
  const scored = await api("PATCH", `/admin/placements/interviews/${interviewId}`, {
    token: adminToken,
    body: { status: "COMPLETED", feedback: "Strong fundamentals, hire." },
  });
  record("admin can record interview feedback", scored.status === 200, `status=${scored.status}`);
  record("interview feedback is persisted", /Strong fundamentals/.test(scored.json?.data?.feedback ?? ""), `feedback=${scored.json?.data?.feedback}`);

  const backToApplied = await api("PATCH", `/admin/placements/applications/${pipelineAppId}/status`, {
    token: adminToken,
    body: { status: "APPLIED" },
  });
  record("illegal status transition is rejected", backToApplied.status === 400, `status=${backToApplied.status}`);

  const selected = await api("PATCH", `/admin/placements/applications/${pipelineAppId}/status`, {
    token: adminToken,
    body: { status: "SELECTED" },
  });
  record("application moves INTERVIEW -> SELECTED", selected.status === 200 && selected.json?.data?.status === "SELECTED", `status=${selected.json?.data?.status}`);

  const offer = await api("POST", `/admin/placements/applications/${pipelineAppId}/offer`, {
    token: adminToken,
    body: { packageAmount: 850000, joiningDate: "2027-01-15" },
  });
  record("admin can create an offer on a selected application", offer.status === 201, `status=${offer.status}`);
  const offerId = offer.json?.data?.id;

  const duplicateOffer = await api("POST", `/admin/placements/applications/${pipelineAppId}/offer`, {
    token: adminToken,
    body: { packageAmount: 900000 },
  });
  record("a second active offer is rejected", duplicateOffer.status === 409, `status=${duplicateOffer.status}`);

  const acceptedOffer = await api("PATCH", `/admin/placements/offers/${offerId}`, {
    token: adminToken,
    body: { offerStatus: "ACCEPTED" },
  });
  record("admin can accept an offer", acceptedOffer.status === 200, `status=${acceptedOffer.status}`);
  const afterAccept = await api("GET", `/admin/placements/applications/${pipelineAppId}`, { token: adminToken });
  record(
    "offer acceptance is persisted on the read model",
    afterAccept.json?.data?.application?.offers?.[0]?.offerStatus === "ACCEPTED",
    `offerStatus=${afterAccept.json?.data?.application?.offers?.[0]?.offerStatus}`,
  );
  const badOfferStatus = await api("PATCH", `/admin/placements/offers/${offerId}`, { token: adminToken, body: { offerStatus: "DECLINED" } });
  record("an already settled offer cannot be changed again", badOfferStatus.status === 400, `status=${badOfferStatus.status}`);

  // --- 11. Drive-level application list ---
  const driveApps = await api("GET", `/admin/placements/drives/${targetDrive.id}/applications`, { token: adminToken });
  record("admin can list applications for a drive", driveApps.status === 200, `status=${driveApps.status}`);
  record(
    "drive application list includes the pipeline application",
    (driveApps.json?.data?.items ?? []).some((a) => a.id === pipelineAppId),
    `count=${driveApps.json?.data?.items?.length}`,
  );
  const driveAppsFiltered = await api("GET", `/admin/placements/drives/${targetDrive.id}/applications?status=SELECTED`, { token: adminToken });
  record(
    "drive application list filters by status",
    (driveAppsFiltered.json?.data?.items ?? []).every((a) => a.status === "SELECTED"),
    `count=${driveAppsFiltered.json?.data?.items?.length}`,
  );

  // --- 12. Analytics ---
  const analytics = await api("GET", "/admin/placements/analytics", { token: adminToken });
  const an = analytics.json?.data;
  record("GET /admin/placements/analytics returns 200", analytics.status === 200, `status=${analytics.status}`);
  record("analytics counts drives", typeof an?.drives?.total === "number", `total=${an?.drives?.total}`);
  record("analytics counts applications", typeof an?.applications?.total === "number", `total=${an?.applications?.total}`);
  record("analytics counts selections", (an?.applications?.selected ?? 0) > 0, `selected=${an?.applications?.selected}`);
  record("analytics counts placements", typeof an?.placementRate?.placedStudents === "number", `placed=${an?.placementRate?.placedStudents}`);
  record("analytics reports an average package", typeof an?.offers?.avgPackage === "number", `avg=${an?.offers?.avgPackage}`);

  // ======================================================== AUTHORIZATION matrix

  const adminReads = ["/admin/placements/companies", "/admin/placements/drives", "/admin/placements/analytics"];
  const adminWrites = [
    ["POST", "/admin/placements/companies", { name: "Should Not Exist" }],
    ["POST", "/admin/placements/drives", { companyId, title: "Should Not Exist", jobRole: "Nope", applicationDeadline: "2026-12-31" }],
    ["PATCH", `/admin/placements/applications/${pipelineAppId}/status`, { status: "REJECTED" }],
    ["POST", `/admin/placements/applications/${pipelineAppId}/offer`, { packageAmount: 1 }],
  ];

  for (const [label, token] of [
    ["student", weakToken],
    ["faculty", facultyToken],
    ["parent", parentToken],
  ]) {
    for (const endpoint of adminReads) {
      const r = await api("GET", endpoint, { token });
      record(`${label} cannot read ${endpoint}`, r.status === 403, `status=${r.status}`);
    }
    for (const [method, endpoint, body] of adminWrites) {
      const r = await api(method, endpoint, { token, body });
      record(`${label} cannot ${method} ${endpoint}`, r.status === 403, `status=${r.status}`);
    }
  }

  for (const endpoint of [...adminReads, "/admin/placements/applications/00000000-0000-0000-0000-000000000000"]) {
    const anon = await api("GET", endpoint);
    record(`unauthenticated cannot read ${endpoint}`, anon.status === 401, `status=${anon.status}`);
  }

  // Faculty may read the catalogue but not a student's own application list.
  const facultyDrives = await api("GET", "/placements/drives", { token: facultyToken });
  record("faculty can read the open drive catalogue", facultyDrives.status === 200, `status=${facultyDrives.status}`);
  const facultyApps = await api("GET", "/placements/applications", { token: facultyToken });
  record("faculty cannot read student applications", facultyApps.status === 403, `status=${facultyApps.status}`);
  const facultyApply = await api("POST", `/placements/drives/${targetDrive.id}/apply`, { token: facultyToken });
  record("faculty cannot apply to a drive", facultyApply.status === 403, `status=${facultyApply.status}`);

  // The pipeline application is untouched by the blocked write attempts.
  const afterBlocked = await api("GET", `/admin/placements/applications/${pipelineAppId}`, { token: adminToken });
  record(
    "blocked writes left the selected application untouched",
    afterBlocked.json?.data?.application?.status === "SELECTED",
    `status=${afterBlocked.json?.data?.application?.status}`,
  );
  record(
    "blocked writes did not add an offer",
    (afterBlocked.json?.data?.application?.offers ?? []).length === 1,
    `offers=${afterBlocked.json?.data?.application?.offers?.length}`,
  );

  // ============================================================ BROWSER layer

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

  const clickExact = async (selector, text) => {
    const clicked = await page.evaluate(
      (sel, wanted) => {
        const el = Array.from(document.querySelectorAll(sel)).find((n) => (n.textContent || "").trim() === wanted);
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      text,
    );
    if (!clicked) throw new Error(`no ${selector} with exact text "${text}"`);
  };

  const clickContaining = async (selector, texts) => {
    const clicked = await page.evaluate(
      (sel, wanted) => {
        const el = Array.from(document.querySelectorAll(sel)).find((n) => {
          const own = n.textContent || "";
          return wanted.every((w) => own.includes(w));
        });
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      texts,
    );
    if (!clicked) throw new Error(`no ${selector} containing ${JSON.stringify(texts)}`);
  };

  // --- 13. Student placements page ---
  await login(WEAK);
  await page.goto(`${BASE}/placements`, { waitUntil: "networkidle0" });
  await page.waitForFunction((n) => document.body.innerText.includes(`Open drives (${n})`), { timeout: 20000 }, studentDrivesAfter.length);
  const weakBody = await page.evaluate(() => document.body.innerText);
  record("placements page loads", page.url().includes("/placements"));
  record("open drives count is rendered", weakBody.includes(`Open drives (${studentDrivesAfter.length})`), `expected ${studentDrivesAfter.length}`);
  record("the drive published via the API is listed", weakBody.includes("Verification Engineer"));
  record("ineligible drives are labelled", weakBody.includes("Not eligible"), `blocked=${blockedDrives.length}`);
  record("eligible drives are labelled", weakBody.includes("Eligible"));
  record("My applications section is rendered", weakBody.includes("My applications ("));
  record("placement history section is rendered", weakBody.includes("Placement history"));
  record("eligibility is explained as computed from live records", weakBody.includes("Eligibility is computed from live academic records"));
  record("the pipeline application is shown with its status", weakBody.includes("SELECTED"));

  // Open a drive to reveal eligibility detail and the apply action.
  // "opening(s)" only ever renders inside the detail panel, so it is a
  // reliable signal that the panel finished loading (the list badges
  // "Eligible"/"Not eligible" would otherwise match immediately).
  await clickContaining("button", [targetDrive.jobRole, targetDrive.companyName]);
  await page.waitForFunction(() => document.body.innerText.includes("opening(s)"), { timeout: 20000 });
  const detailBody = await page.evaluate(() => document.body.innerText);
  record("drive detail panel opens", detailBody.includes("deadline "));
  record("drive detail states eligibility", detailBody.includes("Eligible — you can apply"), `hasNotEligible=${detailBody.includes("Not eligible")}`);
  record("drive detail shows the standing figures", /CGPA [\d.]+ · backlogs \d+ · attendance [\d.]+%/.test(detailBody), `sample=${detailBody.match(/CGPA [\d.]+ · backlogs \d+ · attendance [\d.]+%/)?.[0] ?? ""}`);
  record("drive detail exposes the apply action", detailBody.includes("Applied") || detailBody.includes("Apply now"));
  const eligibleApply = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => ["Apply now", "Applied", "Applying..."].includes((b.textContent || "").trim()));
    return btn ? { found: true, disabled: btn.disabled, text: (btn.textContent || "").trim() } : { found: false };
  });
  record("an eligible drive offers a working Apply button", eligibleApply.found && !eligibleApply.disabled, JSON.stringify(eligibleApply));

  // An ineligible drive must not offer a working apply button.
  await clickContaining("button", [ineligibleDrive.jobRole, ineligibleDrive.companyName]);
  await page.waitForFunction(() => /CGPA below|Backlog limit|Attendance below/.test(document.body.innerText), { timeout: 20000 });
  const blockedDetail = await page.evaluate(() => document.body.innerText);
  record("an ineligible drive explains the blocking reasons", /CGPA below|Backlog limit|Attendance below/.test(blockedDetail));
  const blockedApply = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => ["Apply now", "Applied", "Applying..."].includes((b.textContent || "").trim()));
    return btn ? { found: true, disabled: btn.disabled, text: (btn.textContent || "").trim() } : { found: false };
  });
  record("an ineligible drive disables Apply instead of offering it", blockedApply.found && blockedApply.disabled, JSON.stringify(blockedApply));
  // --- 14. Admin placement management tabs ---
  await logout();
  await login(ADMIN);
  await page.goto(`${BASE}/admin/placements`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Placement Management"), { timeout: 20000 });
  const adminBody = await page.evaluate(() => document.body.innerText);
  record("admin placement page loads", page.url().includes("/admin/placements"));
  record("admin drives tab renders a drive list", /Drives \(\d+\)/.test(adminBody), `match=${adminBody.match(/Drives \(\d+\)/)?.[0]}`);
  record("admin offers company and drive creation", adminBody.includes("New company") && adminBody.includes("New drive"));
  record("admin drives tab shows the drive created through the API", adminBody.includes("Verification Engineer"));

  await clickExact("button", "Companies");
  await page.waitForFunction(() => /Companies \(\d+\)/.test(document.body.innerText), { timeout: 20000 });
  const companiesBody = await page.evaluate(() => document.body.innerText);
  record("companies tab lists companies", /Companies \(\d+\)/.test(companiesBody), `match=${companiesBody.match(/Companies \(\d+\)/)?.[0]}`);
  record("the company created via the API is listed", companiesBody.includes("E2E Verification Industries"));
  record("the company edit is reflected in the UI", companiesBody.includes("Hyderabad"));

  await clickExact("button", "Applications");
  await page.waitForFunction(() => document.body.innerText.includes("Applications"), { timeout: 20000 });
  const appsBody = await page.evaluate(() => document.body.innerText);
  record("applications tab renders", appsBody.includes("Applications"));
  record("applications tab lets staff pick a drive", appsBody.includes("Select drive"));

  await clickExact("button", "Analytics");
  await page.waitForFunction(() => document.body.innerText.includes("Placed students"), { timeout: 20000 });
  const analyticsBody = await page.evaluate(() => document.body.innerText);
  record("analytics tab renders drive metrics", analyticsBody.includes("Active drives"));
  record("analytics tab renders application metrics", analyticsBody.includes("Shortlisted"));
  record("analytics tab renders placement rate", analyticsBody.includes("Placed students") && analyticsBody.includes("Average package"));
  record("analytics explains the placement rate formula", analyticsBody.includes("Placement rate ="));

  // --- 15. Non-admin roles never reach the admin page ---
  for (const [label, email] of [
    ["student", WEAK],
    ["faculty", FACULTY],
  ]) {
    await logout();
    await login(email);
    await page.goto(`${BASE}/admin/placements`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => !location.pathname.startsWith("/admin/placements"), { timeout: 20000 });
    const body = await page.evaluate(() => document.body.innerText);
    record(`${label} is redirected away from /admin/placements`, !page.url().includes("/admin/placements"), `url=${page.url()}`);
    record(`${label} never sees placement management data`, !body.includes("Placement Management"));
  }

  // --- 16. Anonymous visitors are bounced ---
  await logout();
  await page.goto(`${BASE}/placements`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
  record("anonymous /placements redirects to /login", page.url().includes("/login"), `url=${page.url()}`);

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== PHASE 12 E2E SUMMARY ===`);
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
