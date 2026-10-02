"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineSpinner } from "@/components/states/loading-state";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type RegistrableRole = "STUDENT" | "FACULTY" | "ADMIN";

interface RegisterResponse {
  status: string;
  message: string;
}

interface WizardState {
  email: string;
  password: string;
  confirmPassword: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  studentNo: string;
  department: string;
  semester: number;
  section: string;
  batchYear: number;
  employeeNo: string;
  designation: string;
  jobTitle: string;
}

const EMPTY: WizardState = {
  email: "",
  password: "",
  confirmPassword: "",
  code: "",
  firstName: "",
  lastName: "",
  phone: "",
  studentNo: "",
  department: "",
  semester: 1,
  section: "A",
  batchYear: new Date().getFullYear(),
  employeeNo: "",
  designation: "",
  jobTitle: "",
};

const ROLE_OPTIONS: { role: RegistrableRole; title: string; blurb: string }[] = [
  { role: "STUDENT", title: "Student", blurb: "Courses, attendance, fees, timetable and ML insights." },
  { role: "FACULTY", title: "Teacher / Faculty", blurb: "Teach courses, mark attendance, review student risk." },
  { role: "ADMIN", title: "Administrator", blurb: "Campus operations: fees, timetable, hostel, transport." },
];

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "At least 1 uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "At least 1 number", test: (v: string) => /[0-9]/.test(v) },
  { label: "At least 1 special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function RegisterWizard() {
  const [role, setRole] = useState<RegistrableRole | null>(null);
  const [form, setForm] = useState<WizardState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof WizardState, string>>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  /** Students need no verification code, so their wizard is one step shorter. */
  const steps = useMemo(() => {
    const base = ["Account", "Personal details", "Review"];
    return role === "STUDENT" ? base : ["Account", "Verification", "Personal details", "Review"];
  }, [role]);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const set = <K extends keyof WizardState>(field: K, value: WizardState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateCurrentStep = (): boolean => {
    const next: Partial<Record<keyof WizardState, string>> = {};

    if (step === "Account") {
      if (!form.email.trim()) next.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Enter a valid email address";
      if (!form.password) next.password = "Password is required";
      else {
        for (const rule of PASSWORD_RULES) {
          if (!rule.test(form.password)) {
            next.password = rule.label;
            break;
          }
        }
      }
      if (!form.confirmPassword) next.confirmPassword = "Confirm your password";
      else if (form.password !== form.confirmPassword) next.confirmPassword = "Passwords do not match";
    }

    if (step === "Verification") {
      if (!form.code.trim()) next.code = "Verification code is required";
    }

    if (step === "Personal details") {
      if (!form.firstName.trim()) next.firstName = "First name is required";
      if (!form.lastName.trim()) next.lastName = "Last name is required";
      if (!form.phone.trim()) next.phone = "Phone number is required";
      else if (form.phone.replace(/\D/g, "").length < 10) next.phone = "Enter a valid phone number";

      if (role === "STUDENT") {
        if (!form.studentNo.trim()) next.studentNo = "Student number is required";
        if (!form.department.trim()) next.department = "Department is required";
      }
      if (role === "FACULTY") {
        if (!form.employeeNo.trim()) next.employeeNo = "Employee number is required";
        if (!form.department.trim()) next.department = "Department is required";
        if (!form.designation.trim()) next.designation = "Designation is required";
      }
      if (role === "ADMIN") {
        if (!form.department.trim()) next.department = "Department is required";
        if (!form.jobTitle.trim()) next.jobTitle = "Job title is required";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!role) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api<RegisterResponse>("/auth/register", {
        method: "POST",
        token: null,
        body: {
          role,
          email: form.email.trim().toLowerCase(),
          password: form.password,
          confirmPassword: form.confirmPassword,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          ...(role === "STUDENT"
            ? {
                studentNo: form.studentNo.trim(),
                department: form.department.trim(),
                semester: form.semester,
                section: form.section.trim(),
                batchYear: form.batchYear,
              }
            : {}),
          ...(role === "FACULTY"
            ? {
                code: form.code.trim(),
                employeeNo: form.employeeNo.trim(),
                department: form.department.trim(),
                designation: form.designation.trim(),
              }
            : {}),
          ...(role === "ADMIN"
            ? {
                code: form.code.trim(),
                department: form.department.trim(),
                jobTitle: form.jobTitle.trim(),
              }
            : {}),
        },
      });
      setDone(true);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!role) return;
    if (!isLast) {
      if (!validateCurrentStep()) return;
      setStepIndex((i) => i + 1);
      return;
    }
    if (!validateCurrentStep()) return;
    void submit();
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registration submitted</CardTitle>
          <CardDescription>
            Your account is waiting for Super Admin approval. You will be able to sign in once it is approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Registration submitted. Your account is waiting for Super Admin approval.
            </AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{role ? `Register as ${ROLE_OPTIONS.find((r) => r.role === role)?.title}` : "Create an account"}</CardTitle>
        <CardDescription>
          {role
            ? `Step ${stepIndex + 1} of ${steps.length} · ${step}`
            : "Choose the kind of account you need. Parent and alumni accounts are created by the campus office."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {role && (
          <ol className="mb-6 flex items-center gap-2" aria-label="Registration progress">
            {steps.map((label, index) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={index === stepIndex ? "step" : undefined}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    index < stepIndex && "border-primary bg-primary text-primary-foreground",
                    index === stepIndex && "border-primary text-primary",
                    index > stepIndex && "border-border text-muted-foreground",
                  )}
                >
                  {index < stepIndex ? "✓" : index + 1}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{label}</span>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {!role && (
            <div className="grid gap-3">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.role}
                  type="button"
                  onClick={() => {
                    setRole(option.role);
                    setStepIndex(0);
                    setForm(EMPTY);
                  }}
                  className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <p className="text-sm font-medium">{option.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.blurb}</p>
                </button>
              ))}
            </div>
          )}

          {role && step === "Account" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="reg-email">University email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder="your.name@university.edu"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    aria-invalid={Boolean(errors.password)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>
                {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
                <ul className="space-y-1">
                  {PASSWORD_RULES.map((rule) => (
                    <li
                      key={rule.label}
                      className={cn(
                        "text-xs",
                        rule.test(form.password) ? "text-emerald-600" : "text-muted-foreground",
                      )}
                    >
                      {rule.test(form.password) ? "✓" : "•"} {rule.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-confirm">Confirm password</Label>
                <Input
                  id="reg-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => set("confirmPassword", e.target.value)}
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                {errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword}</p>}
              </div>
            </>
          )}

          {role && step === "Verification" && (
            <div className="space-y-2">
              <Label htmlFor="reg-code">
                {role === "FACULTY" ? "Faculty verification code" : "Administrator verification code"}
              </Label>
              <Input
                id="reg-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                aria-invalid={Boolean(errors.code)}
              />
              {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
              <p className="text-xs text-muted-foreground">
                This code is issued by your department / campus office. It is verified by the server.
              </p>
            </div>
          )}

          {role && step === "Personal details" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reg-first">First name</Label>
                  <Input
                    id="reg-first"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    aria-invalid={Boolean(errors.firstName)}
                  />
                  {errors.firstName && <p className="text-xs text-red-600">{errors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-last">Last name</Label>
                  <Input
                    id="reg-last"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    aria-invalid={Boolean(errors.lastName)}
                  />
                  {errors.lastName && <p className="text-xs text-red-600">{errors.lastName}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-phone">Phone number</Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                />
                {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
              </div>

              {role === "STUDENT" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reg-student-no">Registration / student number</Label>
                    <Input
                      id="reg-student-no"
                      value={form.studentNo}
                      onChange={(e) => set("studentNo", e.target.value)}
                      aria-invalid={Boolean(errors.studentNo)}
                    />
                    {errors.studentNo && <p className="text-xs text-red-600">{errors.studentNo}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-department">Course / department</Label>
                    <Input
                      id="reg-department"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                      aria-invalid={Boolean(errors.department)}
                    />
                    {errors.department && <p className="text-xs text-red-600">{errors.department}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="reg-semester">Semester</Label>
                      <Select value={String(form.semester)} onValueChange={(v) => set("semester", Number(v))}>
                        <SelectTrigger id="reg-semester">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-section">Section</Label>
                      <Input
                        id="reg-section"
                        value={form.section}
                        onChange={(e) => set("section", e.target.value)}
                        aria-invalid={Boolean(errors.section)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-batch">Batch year</Label>
                      <Input
                        id="reg-batch"
                        type="number"
                        value={form.batchYear}
                        onChange={(e) => set("batchYear", Number(e.target.value))}
                      />
                    </div>
                  </div>
                </>
              )}

              {role === "FACULTY" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reg-employee-no">Employee number</Label>
                    <Input
                      id="reg-employee-no"
                      value={form.employeeNo}
                      onChange={(e) => set("employeeNo", e.target.value)}
                      aria-invalid={Boolean(errors.employeeNo)}
                    />
                    {errors.employeeNo && <p className="text-xs text-red-600">{errors.employeeNo}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-department">Department</Label>
                    <Input
                      id="reg-department"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                      aria-invalid={Boolean(errors.department)}
                    />
                    {errors.department && <p className="text-xs text-red-600">{errors.department}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-designation">Designation</Label>
                    <Input
                      id="reg-designation"
                      placeholder="Assistant Professor"
                      value={form.designation}
                      onChange={(e) => set("designation", e.target.value)}
                      aria-invalid={Boolean(errors.designation)}
                    />
                    {errors.designation && <p className="text-xs text-red-600">{errors.designation}</p>}
                  </div>
                </>
              )}

              {role === "ADMIN" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reg-department">Department</Label>
                    <Input
                      id="reg-department"
                      placeholder="Administration"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                      aria-invalid={Boolean(errors.department)}
                    />
                    {errors.department && <p className="text-xs text-red-600">{errors.department}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-job-title">Job title</Label>
                    <Input
                      id="reg-job-title"
                      placeholder="System Administrator"
                      value={form.jobTitle}
                      onChange={(e) => set("jobTitle", e.target.value)}
                      aria-invalid={Boolean(errors.jobTitle)}
                    />
                    {errors.jobTitle && <p className="text-xs text-red-600">{errors.jobTitle}</p>}
                  </div>
                </div>
              )}
            </>
          )}

          {role && step === "Review" && (
            <dl className="space-y-2 text-sm">
              <ReviewRow label="Role" value={ROLE_OPTIONS.find((r) => r.role === role)?.title ?? role} />
              <ReviewRow label="Email" value={form.email} />
              <ReviewRow label="Name" value={`${form.firstName} ${form.lastName}`.trim()} />
              <ReviewRow label="Phone" value={form.phone} />
              {role === "STUDENT" && (
                <>
                  <ReviewRow label="Student number" value={form.studentNo} />
                  <ReviewRow label="Department" value={form.department} />
                  <ReviewRow
                    label="Semester / section / batch"
                    value={`${form.semester} · ${form.section} · ${form.batchYear}`}
                  />
                </>
              )}
              {role === "FACULTY" && (
                <>
                  <ReviewRow label="Employee number" value={form.employeeNo} />
                  <ReviewRow label="Department" value={form.department} />
                  <ReviewRow label="Designation" value={form.designation} />
                </>
              )}
              {role === "ADMIN" && (
                <>
                  <ReviewRow label="Department" value={form.department} />
                  <ReviewRow label="Job title" value={form.jobTitle} />
                </>
              )}
            </dl>
          )}

          {role && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (stepIndex === 0) {
                    setRole(null);
                    setForm(EMPTY);
                  } else {
                    setStepIndex((i) => i - 1);
                  }
                }}
                disabled={submitting}
              >
                Back
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <InlineSpinner className="mr-2" />
                    Submitting...
                  </>
                ) : isLast ? (
                  "Submit registration"
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}