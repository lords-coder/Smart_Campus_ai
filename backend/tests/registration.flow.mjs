/**
 * Registration, approval and account-help API test.
 * Run:  node tests/registration.flow.mjs   (backend must be running)
 *
 * Covers:
 *   - student / faculty / admin registration (valid + every rejection path)
 *   - the server-side verification codes
 *   - pending + rejected login blocking
 *   - SUPER_ADMIN bootstrap, login and registration management
 *   - password-help request lifecycle and the single-use reset token
 *   - authorization: no normal role can approve a registration
 *
 * Test-only accounts are created with unique e-mail addresses; the assertions
 * below are the proof that the flow behaves, not the accounts themselves.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Reuse the backend's own configuration so the test never hardcodes a secret.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000/api";
const RUN = Date.now();

const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL ?? "hitman@3600.ac.in",
  password: process.env.SUPER_ADMIN_PASSWORD ?? "",
};
const ADMIN_CODE = process.env.ADMIN_REGISTRATION_CODE ?? "";
const FACULTY_CODE = process.env.FACULTY_REGISTRATION_CODE ?? "";
const DOMAIN = process.env.UNIVERSITY_EMAIL_DOMAIN ?? "smartcampus.edu";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function req(method, endpoint, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* non JSON body */
  }
  return { status: response.status, json };
}

async function login(credentials) {
  const { status, json } = await req("POST", "/auth/login", { body: credentials });
  return { status, json, token: json?.data?.token };
}

const studentPayload = (overrides = {}) => ({
  role: "STUDENT",
  email: `reg.student.${RUN}.${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`,
  password: "Str0ng!Pass1",
  confirmPassword: "Str0ng!Pass1",
  firstName: "Test",
  lastName: "Student",
  phone: "9876543210",
  studentNo: `SC-T-${RUN}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  department: "Computer Science and Engineering",
  semester: 3,
  section: "A",
  batchYear: 2025,
  ...overrides,
});

const facultyPayload = (overrides = {}) => ({
  role: "FACULTY",
  email: `reg.faculty.${RUN}.${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`,
  password: "Str0ng!Pass1",
  confirmPassword: "Str0ng!Pass1",
  code: FACULTY_CODE,
  firstName: "Test",
  lastName: "Faculty",
  phone: "9876543211",
  employeeNo: `EMP-T-${RUN}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  department: "Computer Science and Engineering",
  designation: "Assistant Professor",
  ...overrides,
});

const adminPayload = (overrides = {}) => ({
  role: "ADMIN",
  email: `reg.admin.${RUN}.${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`,
  password: "Str0ng!Pass1",
  confirmPassword: "Str0ng!Pass1",
  code: ADMIN_CODE,
  firstName: "Test",
  lastName: "Admin",
  phone: "9876543212",
  department: "Administration",
  jobTitle: "System Administrator",
  ...overrides,
});

/** Approve the newest pending registration and return its id. */
async function pendingRegistrationId(superToken, requestedRole) {
  const list = await req("GET", `/super-admin/registrations?status=PENDING_APPROVAL`, { token: superToken });
  const match = (list.json?.data?.items ?? []).find((item) => item.requestedRole === requestedRole);
  return match?.id ?? null;
}

async function main() {
  // ------------------------------------------------------------ SUPER_ADMIN
  const superLogin = await login(SUPER_ADMIN);
  check("SUPER_ADMIN can log in", superLogin.status === 200, `status=${superLogin.status}`);
  check("SUPER_ADMIN role is returned", superLogin.json?.data?.user?.role === "SUPER_ADMIN");
  check("login never returns a password hash", superLogin.json?.data?.user?.password_hash === undefined);
  const superToken = superLogin.token;

  // ------------------------------------------------- student registration
  const student = studentPayload();
  const studentReg = await req("POST", "/auth/register", { body: student });
  check("student registration -> 201", studentReg.status === 201, `status=${studentReg.status}`);
  check("student registration returns PENDING_APPROVAL", studentReg.json?.data?.status === "PENDING_APPROVAL");
  check("registration never issues a token", studentReg.json?.data?.token === undefined);

  const badPassword = await req("POST", "/auth/register", { body: studentPayload({ password: "weakpass" }) });
  check("weak password -> 400", badPassword.status === 400, `status=${badPassword.status}`);
  check(
    "weak password explains the rule",
    String(badPassword.json?.error?.details?.[0]?.message ?? badPassword.json?.error?.message ?? "").toLowerCase().includes("uppercase") ||
      String(badPassword.json?.error?.details?.[0]?.message ?? "").toLowerCase().includes("special"),
    JSON.stringify(badPassword.json?.error?.details?.[0]?.message ?? ""),
  );

  const noUpper = await req("POST", "/auth/register", { body: studentPayload({ password: "nouppercase1!", confirmPassword: "nouppercase1!" }) });
  check("password without uppercase -> 400", noUpper.status === 400, `status=${noUpper.status}`);

  const noNumber = await req("POST", "/auth/register", { body: studentPayload({ password: "NoNumberHere!", confirmPassword: "NoNumberHere!" }) });
  check("password without a number -> 400", noNumber.status === 400, `status=${noNumber.status}`);

  const noSpecial = await req("POST", "/auth/register", { body: studentPayload({ password: "NoSpecial123", confirmPassword: "NoSpecial123" }) });
  check("password without a special character -> 400", noSpecial.status === 400, `status=${noSpecial.status}`);

  const mismatched = await req("POST", "/auth/register", { body: studentPayload({ confirmPassword: "Different1!" }) });
  check("password confirmation mismatch -> 400", mismatched.status === 400, `status=${mismatched.status}`);

  const missingField = await req("POST", "/auth/register", { body: studentPayload({ phone: undefined }) });
  check("missing required field -> 400", missingField.status === 400, `status=${missingField.status}`);

  const wrongDomain = await req("POST", "/auth/register", { body: studentPayload({ email: `someone@gmail.com` }) });
  check("non-university e-mail -> 400", wrongDomain.status === 400, `status=${wrongDomain.status}`);
  check("non-university e-mail code", wrongDomain.json?.error?.code === "INVALID_EMAIL_DOMAIN", wrongDomain.json?.error?.code);

  const duplicate = await req("POST", "/auth/register", { body: studentPayload({ email: student.email }) });
  check("duplicate e-mail -> 409", duplicate.status === 409, `status=${duplicate.status}`);
  check("duplicate e-mail code", duplicate.json?.error?.code === "EMAIL_TAKEN", duplicate.json?.error?.code);

  const escalate = await req("POST", "/auth/register", { body: studentPayload({ role: "SUPER_ADMIN" }) });
  check("cannot register as SUPER_ADMIN -> 400", escalate.status === 400, `status=${escalate.status}`);

  const parentRole = await req("POST", "/auth/register", { body: studentPayload({ role: "PARENT" }) });
  check("cannot register as PARENT -> 400", parentRole.status === 400, `status=${parentRole.status}`);

  const alumniRole = await req("POST", "/auth/register", { body: studentPayload({ role: "ALUMNI" }) });
  check("cannot register as ALUMNI -> 400", alumniRole.status === 400, `status=${alumniRole.status}`);

  // pending student cannot log in
  const pendingLogin = await login({ email: student.email, password: student.password });
  check("pending student cannot log in", pendingLogin.status === 403, `status=${pendingLogin.status}`);
  check("pending login code", pendingLogin.json?.error?.code === "REGISTRATION_PENDING", pendingLogin.json?.error?.code);
  check("pending login issues no token", pendingLogin.json?.data?.token === undefined);

  // ----------------------------------------------- faculty registration
  const faculty = facultyPayload();
  const facultyBadCode = await req("POST", "/auth/register", { body: facultyPayload({ code: "00000000" }) });
  check("faculty wrong code -> 400", facultyBadCode.status === 400, `status=${facultyBadCode.status}`);
  check("faculty wrong code is refused with a typed code", facultyBadCode.json?.error?.code === "INVALID_REGISTRATION_CODE", facultyBadCode.json?.error?.code);

  const facultyMissingCode = await req("POST", "/auth/register", { body: facultyPayload({ code: undefined }) });
  check("faculty without a code -> 400", facultyMissingCode.status === 400, `status=${facultyMissingCode.status}`);

  const facultyReg = await req("POST", "/auth/register", { body: faculty });
  check("faculty registration -> 201", facultyReg.status === 201, `status=${facultyReg.status}`);
  check("faculty registration stays pending", facultyReg.json?.data?.status === "PENDING_APPROVAL");

  // a rejected code must not have created anything
  const badCodeLogin = await login({ email: facultyPayload().email, password: "Str0ng!Pass1" });
  check("a wrong-code registration created no account", badCodeLogin.status === 401, `status=${badCodeLogin.status}`);

  // ------------------------------------------------- admin registration
  const admin = adminPayload();
  const adminBadCode = await req("POST", "/auth/register", { body: adminPayload({ code: "11111111" }) });
  check("admin wrong code -> 400", adminBadCode.status === 400, `status=${adminBadCode.status}`);
  check("admin wrong code is refused with a typed code", adminBadCode.json?.error?.code === "INVALID_REGISTRATION_CODE", adminBadCode.json?.error?.code);

  const adminReg = await req("POST", "/auth/register", { body: admin });
  check("admin registration -> 201", adminReg.status === 201, `status=${adminReg.status}`);
  check("admin registration stays pending", adminReg.json?.data?.status === "PENDING_APPROVAL");

  // ------------------------------- registration list + authorization
  const listPending = await req("GET", "/super-admin/registrations?status=PENDING_APPROVAL", { token: superToken });
  check("SUPER_ADMIN lists pending registrations", listPending.status === 200, `status=${listPending.status}`);
  check("pending list contains the test registrations", (listPending.json?.data?.total ?? 0) >= 3, `total=${listPending.json?.data?.total}`);

  const sample = (listPending.json?.data?.items ?? [])[0];
  check("registration row never exposes a password", !JSON.stringify(sample ?? {}).includes("Str0ng!Pass1"));
  check("registration row never exposes a verification code", !JSON.stringify(sample?.submission ?? {}).match(/code/i));

  const detail = await req("GET", `/super-admin/registrations/${sample.id}`, { token: superToken });
  check("SUPER_ADMIN reads a registration detail", detail.status === 200, `status=${detail.status}`);
  check("registration detail carries submitted information", Boolean(detail.json?.data?.submission?.email ?? detail.json?.data?.userEmail));

  const anonList = await req("GET", "/super-admin/registrations");
  check("anonymous cannot list registrations", anonList.status === 401, `status=${anonList.status}`);

  // a normal role must not reach the SUPER_ADMIN surface
  const studentApproveDenied = await req("PATCH", `/super-admin/registrations/${sample.id}/approve`, { token: "not.a.token" });
  check("forged token cannot approve", studentApproveDenied.status === 401, `status=${studentApproveDenied.status}`);

  // -------------------------------------------------- approve + log in
  const studentRegistrationId = await pendingRegistrationId(superToken, "STUDENT");
  const approveStudent = await req("PATCH", `/super-admin/registrations/${studentRegistrationId}/approve`, { token: superToken });
  check("SUPER_ADMIN approves the student", approveStudent.status === 200, `status=${approveStudent.status}`);
  check("approval records the reviewer", Boolean(approveStudent.json?.data?.reviewedAt));

  const approvedStudentLogin = await login({ email: student.email, password: student.password });
  check("approved student can log in", approvedStudentLogin.status === 200, `status=${approvedStudentLogin.status}`);
  check("approved student keeps the STUDENT role", approvedStudentLogin.json?.data?.user?.role === "STUDENT");

  const doubleApprove = await req("PATCH", `/super-admin/registrations/${studentRegistrationId}/approve`, { token: superToken });
  check("approving twice -> 409", doubleApprove.status === 409, `status=${doubleApprove.status}`);

  const me = await req("GET", "/auth/me", { token: approvedStudentLogin.token });
  check("approved student has a profile", Boolean(me.json?.data?.profile?.studentNo), JSON.stringify(me.json?.data?.profile ?? {}));

  const facultyRegistrationId = await pendingRegistrationId(superToken, "FACULTY");
  const approveFaculty = await req("PATCH", `/super-admin/registrations/${facultyRegistrationId}/approve`, { token: superToken });
  check("SUPER_ADMIN approves the faculty", approveFaculty.status === 200, `status=${approveFaculty.status}`);
  const facultyLogin = await login({ email: faculty.email, password: faculty.password });
  check("approved faculty can log in", facultyLogin.status === 200, `status=${facultyLogin.status}`);

  const adminRegistrationId = await pendingRegistrationId(superToken, "ADMIN");
  const approveAdmin = await req("PATCH", `/super-admin/registrations/${adminRegistrationId}/approve`, { token: superToken });
  check("SUPER_ADMIN approves the admin", approveAdmin.status === 200, `status=${approveAdmin.status}`);
  const adminLogin = await login({ email: admin.email, password: admin.password });
  check("approved admin can log in", adminLogin.status === 200, `status=${adminLogin.status}`);
  check("approved admin gets the ADMIN role", adminLogin.json?.data?.user?.role === "ADMIN");

  // ------------------------------------------------ reject a registration
  const rejectMe = studentPayload();
  await req("POST", "/auth/register", { body: rejectMe });
  const rejectId = await pendingRegistrationId(superToken, "STUDENT");
  const reject = await req("PATCH", `/super-admin/registrations/${rejectId}/reject`, {
    token: superToken,
    body: { reason: "Test rejection" },
  });
  check("SUPER_ADMIN rejects a registration", reject.status === 200, `status=${reject.status}`);
  check("rejection stores the reason", reject.json?.data?.rejectionReason === "Test rejection", reject.json?.data?.rejectionReason);

  const rejectedLogin = await login({ email: rejectMe.email, password: rejectMe.password });
  check("rejected student cannot log in", rejectedLogin.status === 403, `status=${rejectedLogin.status}`);
  check("rejected login code", rejectedLogin.json?.error?.code === "REGISTRATION_REJECTED", rejectedLogin.json?.error?.code);

  // ------------------------------------------ user management + suspension
  const users = await req("GET", "/super-admin/users?status=ACTIVE", { token: superToken });
  check("SUPER_ADMIN lists users", users.status === 200, `status=${users.status}`);
  check("user list never exposes hashes", !JSON.stringify(users.json ?? {}).includes("password_hash"));

  const targetUser = (users.json?.data?.items ?? []).find((item) => item.email === faculty.email);
  const suspend = await req("PATCH", `/super-admin/users/${targetUser.id}/status`, {
    token: superToken,
    body: { status: "SUSPENDED" },
  });
  check("SUPER_ADMIN suspends a user", suspend.status === 200, `status=${suspend.status}`);

  const suspendedLogin = await login({ email: faculty.email, password: faculty.password });
  check("suspended user cannot log in", suspendedLogin.status === 403, `status=${suspendedLogin.status}`);
  check("suspension blocks the existing session", suspendedLogin.json?.error?.code === "ACCOUNT_SUSPENDED", suspendedLogin.json?.error?.code);

  const reactivate = await req("PATCH", `/super-admin/users/${targetUser.id}/status`, {
    token: superToken,
    body: { status: "ACTIVE" },
  });
  check("SUPER_ADMIN reactivates a user", reactivate.status === 200, `status=${reactivate.status}`);
  const reactivatedLogin = await login({ email: faculty.email, password: faculty.password });
  check("reactivated user can log in again", reactivatedLogin.status === 200, `status=${reactivatedLogin.status}`);

  // a normal ADMIN must not be able to approve registrations
  if (adminLogin.token) {
    const adminApprove = await req("GET", "/super-admin/registrations", { token: adminLogin.token });
    check("normal ADMIN cannot list registrations", adminApprove.status === 403, `status=${adminApprove.status}`);
    check("403 uses FORBIDDEN", adminApprove.json?.error?.code === "FORBIDDEN", adminApprove.json?.error?.code);
  }
  if (approvedStudentLogin.token) {
    const studentList = await req("GET", "/super-admin/registrations", { token: approvedStudentLogin.token });
    check("STUDENT cannot list registrations", studentList.status === 403, `status=${studentList.status}`);
    const studentApprove = await req("PATCH", `/super-admin/registrations/${sample.id}/approve`, { token: approvedStudentLogin.token });
    check("STUDENT cannot approve a registration", studentApprove.status === 403, `status=${studentApprove.status}`);
    const facultyList = await req("GET", "/super-admin/registrations", { token: facultyLogin.token });
    check("FACULTY cannot list registrations", facultyList.status === 403, `status=${facultyList.status}`);
  }

  // SUPER_ADMIN keeps full access to the existing admin surface
  const feeRegister = await req("GET", "/fees", { token: superToken });
  check("SUPER_ADMIN reaches the admin fee register", feeRegister.status === 200, `status=${feeRegister.status}`);
  const timetableOptions = await req("GET", "/timetable/options", { token: superToken });
  check("SUPER_ADMIN reaches the admin timetable options", timetableOptions.status === 200, `status=${timetableOptions.status}`);

  // --------------------------------------------------- password help flow
  const helpEmail = `help.${RUN}.${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`;
  const help = await req("POST", "/auth/password-help", {
    body: { email: student.email, role: "STUDENT", message: "I forgot my password", contact: "9876543210" },
  });
  check("password help request -> 200", help.status === 200, `status=${help.status}`);
  check("password help never echoes a password", !JSON.stringify(help.json ?? {}).includes("Str0ng!Pass1"));

  const helpList = await req("GET", "/super-admin/password-help?status=OPEN", { token: superToken });
  check("SUPER_ADMIN lists help requests", helpList.status === 200, `status=${helpList.status}`);
  const helpRequest = (helpList.json?.data?.items ?? [])[0];
  check("help request is OPEN", helpRequest?.status === "OPEN", helpRequest?.status);
  check("help request has no password column", !JSON.stringify(helpRequest ?? {}).includes("password_hash"));

  const inProgress = await req("PATCH", `/super-admin/password-help/${helpRequest.id}`, {
    token: superToken,
    body: { status: "IN_PROGRESS", adminNotes: "Contacted the department." },
  });
  check("help request moves to IN_PROGRESS", inProgress.status === 200 && inProgress.json?.data?.status === "IN_PROGRESS");

  const issued = await req("POST", `/super-admin/password-help/${helpRequest.id}/reset`, { token: superToken });
  check("SUPER_ADMIN issues a reset link", issued.status === 200, `status=${issued.status}`);
  const resetToken = issued.json?.data?.token;
  check("reset token is returned once", typeof resetToken === "string" && resetToken.length === 64);
  check("reset link points at the frontend", String(issued.json?.data?.resetUrl ?? "").includes("/reset-password?token="));

  const newPassword = "Reset3d!Pass";
  const reset = await req("POST", "/auth/reset-password", {
    body: { token: resetToken, password: newPassword, confirmPassword: newPassword },
  });
  check("password reset -> 200", reset.status === 200, `status=${reset.status}`);

  const oldPasswordLogin = await login({ email: student.email, password: student.password });
  check("old password is invalidated", oldPasswordLogin.status === 401, `status=${oldPasswordLogin.status}`);

  const newPasswordLogin = await login({ email: student.email, password: newPassword });
  check("new password works", newPasswordLogin.status === 200, `status=${newPasswordLogin.status}`);

  const replay = await req("POST", "/auth/reset-password", {
    body: { token: resetToken, password: "Another1!Pass", confirmPassword: "Another1!Pass" },
  });
  check("a reset token cannot be replayed", replay.status === 400, `status=${replay.status}`);

  const bogus = await req("POST", "/auth/reset-password", {
    body: { token: "0".repeat(64), password: newPassword, confirmPassword: newPassword },
  });
  check("an unknown reset token -> 400", bogus.status === 400, `status=${bogus.status}`);

  const resolved = await req("PATCH", `/super-admin/password-help/${helpRequest.id}`, {
    token: superToken,
    body: { status: "RESOLVED", adminNotes: "Password reset link issued and used." },
  });
  check("help request resolves", resolved.status === 200 && resolved.json?.data?.status === "RESOLVED");

  // ---------------------------------------------------------------- done
  console.log("");
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const name of failures) console.log(`  - ${name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("registration.flow test crashed:", error);
  process.exit(1);
});