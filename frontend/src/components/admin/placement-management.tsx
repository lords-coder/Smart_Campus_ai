"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { formatCurrency } from "@/lib/format";
import type {
  PlacementAnalytics,
  PlacementApplication,
  PlacementCompany,
  PlacementDrive,
} from "@/lib/types";

type Tab = "drives" | "companies" | "applications" | "analytics";

const APP_STATUSES = ["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "WAITLISTED", "REJECTED", "WITHDRAWN"];

export function PlacementManagement() {
  const [tab, setTab] = useState<Tab>("drives");
  const [dialog, setDialog] = useState<"company" | "drive" | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["drives", "companies", "applications", "analytics"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("company")}>New company</Button>
          <Button size="sm" onClick={() => setDialog("drive")}>New drive</Button>
        </div>
      </div>

      <div key={version}>
        {tab === "drives" && <DrivesSection />}
        {tab === "companies" && <CompaniesSection />}
        {tab === "applications" && <ApplicationsSection />}
        {tab === "analytics" && <AnalyticsSection />}
      </div>

      {dialog && (
        <PlacementDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function DrivesSection() {
  const [status, setStatus] = useState("OPEN");
  const { data, loading, error, reload } = useApi<{ items: PlacementDrive[]; total: number }>(
    `/admin/placements/drives${status === "all" ? "" : `?status=${status}`}`,
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading drives..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Drives ({data?.total ?? 0})</CardTitle>
        <select className="border rounded px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {["all", "DRAFT", "OPEN", "CLOSED", "CANCELLED", "COMPLETED"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Package</th>
                <th className="px-4 py-2 font-medium">Deadline</th>
                <th className="px-4 py-2 font-medium">Applicants</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{d.jobRole}</td>
                  <td className="px-4 py-2">{d.companyName}</td>
                  <td className="px-4 py-2">{formatCurrency(d.packageMin)} – {formatCurrency(d.packageMax)}</td>
                  <td className="px-4 py-2">{d.applicationDeadline}</td>
                  <td className="px-4 py-2">{d.applicationCount}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{d.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CompaniesSection() {
  const { data, loading, error, reload } = useApi<{ companies: PlacementCompany[] }>("/admin/placements/companies");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading companies..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Companies ({data?.companies.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Drives</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.companies ?? []).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.company_type}</td>
                  <td className="px-4 py-2">{c.location || "—"}</td>
                  <td className="px-4 py-2">{c.drive_count ?? 0}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{c.active ? "ACTIVE" : "INACTIVE"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplicationsSection() {
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return <AdminApplications status={status} onStatusChange={setStatus} selectedId={selectedId} onSelect={setSelectedId} />;
}

function AdminApplications({
  status,
  onStatusChange,
  selectedId,
  onSelect,
}: {
  status: string;
  onStatusChange: (s: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Applications are listed per drive; this view aggregates via the first
  // open drive selector below for review workflows.
  const drives = useApi<{ items: PlacementDrive[] }>("/admin/placements/drives?status=OPEN");
  const [driveId, setDriveId] = useState<string>("");
  const apps = useApi<{ items: PlacementApplication[] }>(
    driveId ? `/admin/placements/drives/${driveId}/applications${status === "all" ? "" : `?status=${status}`}` : null,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Applications</CardTitle>
          <div className="flex gap-2">
            <select className="border rounded px-2 py-1.5 text-sm" value={driveId} onChange={(e) => { setDriveId(e.target.value); onSelect(null); }} aria-label="Select drive">
              <option value="">Select drive</option>
              {(drives.data?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.jobRole} · {d.companyName} ({d.applicationCount})</option>
              ))}
            </select>
            <select className="border rounded px-2 py-1.5 text-sm" value={status} onChange={(e) => onStatusChange(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {APP_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {!driveId ? (
            <p className="text-sm text-muted-foreground">Select a drive to review its applicants.</p>
          ) : apps.loading ? (
            <LoadingState label="Loading applications..." />
          ) : apps.error ? (
            <ErrorState message={apps.error} onRetry={apps.reload} />
          ) : (apps.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No applications match.</p>
          ) : (
            <ul className="space-y-2">
              {(apps.data?.items ?? []).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => onSelect(a.id)}
                    className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedId === a.id ? "border-primary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{a.studentName} ({a.studentNo})</p>
                      <Badge variant="outline">{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Applied {a.appliedAt.slice(0, 10)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div>
        {!selectedId ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Select an application to review it.</p>
            </CardContent>
          </Card>
        ) : (
          <ApplicationDetailPanel applicationId={selectedId} onChanged={() => apps.reload()} />
        )}
      </div>
    </div>
  );
}

interface ApplicationDetail {
  application: PlacementApplication;
  academicStanding: { cgpa: number; backlogs: number; attendancePercentage: number };
}

function ApplicationDetailPanel({ applicationId, onChanged }: { applicationId: string; onChanged: () => void }) {
  const { data: detail, loading, error, reload } = useApi<ApplicationDetail>(
    `/admin/placements/applications/${applicationId}`,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState(false);
  const [offerForm, setOfferForm] = useState(false);

  if (loading) return <LoadingState label="Loading application..." />;
  if (error || !detail) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;

  const app = detail.application;

  async function act(kind: string, body?: unknown, path?: string, method: "PATCH" | "POST" = "PATCH") {
    setBusy(kind);
    setActionError(null);
    try {
      await api(path ?? `/admin/placements/applications/${applicationId}/status`, { method, body });
      reload();
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{app.studentName} · {app.jobRole}</span>
          <Badge variant="outline">{app.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{app.companyName} · {app.studentNo}</p>
        <p>
          <span className="text-muted-foreground">Academics:</span> CGPA {detail.academicStanding.cgpa} ·
          backlogs {detail.academicStanding.backlogs} · attendance {detail.academicStanding.attendancePercentage}%
        </p>
        {app.interviews.length > 0 && (
          <div>
            <p className="font-medium">Interviews</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {app.interviews.map((iv) => (
                <li key={iv.id}>{iv.roundName} · {iv.scheduledAt.slice(0, 16).replace("T", " ")} · {iv.status}{iv.feedback ? ` · ${iv.feedback}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
        {app.offers.length > 0 && (
          <div>
            <p className="font-medium">Offers</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {app.offers.map((o) => (
                <li key={o.id}>{formatCurrency(o.packageAmount)} · {o.offerStatus}</li>
              ))}
            </ul>
          </div>
        )}
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}
        <div className="flex flex-wrap gap-2">
          {(app.status === "APPLIED") && (
            <Button size="sm" disabled={busy !== null} onClick={() => act("shortlist", undefined, `/admin/placements/applications/${applicationId}/shortlist`)}>Shortlist</Button>
          )}
          {(app.status === "SHORTLISTED" || app.status === "INTERVIEW" || app.status === "WAITLISTED") && (
            <>
              <Button size="sm" variant="outline" onClick={() => setInterviewForm((v) => !v)}>Schedule interview</Button>
              <Button size="sm" variant="outline" onClick={() => setOfferForm((v) => !v)}>Record selection + offer</Button>
            </>
          )}
          {["APPLIED", "SHORTLISTED", "INTERVIEW", "WAITLISTED"].includes(app.status) && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("reject", { status: "REJECTED" })}>Reject</Button>
          )}
        </div>
        {interviewForm && (
          <InterviewForm
            applicationId={applicationId}
            onClose={() => setInterviewForm(false)}
            onSaved={() => { setInterviewForm(false); reload(); onChanged(); }}
          />
        )}
        {offerForm && (
          <OfferForm
            applicationId={applicationId}
            onClose={() => setOfferForm(false)}
            onSaved={() => { setOfferForm(false); reload(); onChanged(); }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsSection() {
  const { data, loading, error, reload } = useApi<PlacementAnalytics>("/admin/placements/analytics");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading analytics..." />;
  const cards = [
    { label: "Active drives", value: data?.drives.active ?? 0, hint: `${data?.drives.total ?? 0} total drives` },
    { label: "Applications", value: data?.applications.total ?? 0, hint: `${data?.applications.applicantStudents ?? 0} applicants` },
    { label: "Shortlisted", value: data?.applications.shortlisted ?? 0, hint: `${data?.applications.inInterview ?? 0} in interview` },
    { label: "Selected", value: data?.applications.selected ?? 0, hint: `${data?.offers.accepted ?? 0} offers accepted` },
    { label: "Placed students", value: data?.placementRate.placedStudents ?? 0, hint: `of ${data?.placementRate.enrolledStudents ?? 0} enrolled (${data?.placementRate.rate ?? 0}%)` },
    { label: "Average package", value: data?.offers.avgPackage ? formatCurrency(data.offers.avgPackage) : "—", hint: data?.offers.maxPackage ? `Highest ${formatCurrency(data.offers.maxPackage)}` : "No accepted offers yet" },
  ];
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className="text-xs text-gray-400">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Placement rate = students holding an accepted offer ÷ students with an active enrollment.
      </p>
    </div>
  );
}

function PlacementDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: "company" | "drive";
  onClose: () => void;
  onSaved: () => void;
}) {
  const companies = useApi<{ companies: PlacementCompany[] }>(kind === "drive" ? "/admin/placements/companies" : null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "company") {
        await api("/admin/placements/companies", {
          method: "POST",
          body: { name: form.name, industry: form.industry || "", companyType: form.companyType || "OTHER", location: form.location || "" },
        });
      } else {
        await api("/admin/placements/drives", {
          method: "POST",
          body: {
            companyId: form.companyId,
            title: form.title,
            jobRole: form.jobRole,
            description: form.description || "",
            packageMin: Number(form.packageMin || 0),
            packageMax: Number(form.packageMax || form.packageMin || 0),
            location: form.location || "",
            openings: Number(form.openings || 1),
            applicationDeadline: form.applicationDeadline,
            minCgpa: form.minCgpa ? Number(form.minCgpa) : null,
            maxBacklogs: form.maxBacklogs !== undefined && form.maxBacklogs !== "" ? Number(form.maxBacklogs) : null,
            minAttendance: form.minAttendance ? Number(form.minAttendance) : null,
          },
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader><CardTitle>{kind === "company" ? "New company" : "New drive"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "company" && (
              <>
                <Field label="Name" value={form.name ?? ""} onChange={set("name")} required />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Type</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.companyType ?? "OTHER"} onChange={set("companyType")}>
                      {["PRODUCT", "SERVICE", "STARTUP", "CONSULTING", "GOVERNMENT", "NON_PROFIT", "OTHER"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Location" value={form.location ?? ""} onChange={set("location")} />
                </div>
                <Field label="Industry" value={form.industry ?? ""} onChange={set("industry")} />
              </>
            )}
            {kind === "drive" && (
              <>
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.companyId ?? ""} onChange={set("companyId")} required>
                    <option value="">Select company</option>
                    {(companies.data?.companies ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <Field label="Title" value={form.title ?? ""} onChange={set("title")} required />
                <Field label="Job role" value={form.jobRole ?? ""} onChange={set("jobRole")} required />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Min package (Rs.)" value={form.packageMin ?? ""} onChange={set("packageMin")} />
                  <Field label="Max package (Rs.)" value={form.packageMax ?? ""} onChange={set("packageMax")} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Openings" value={form.openings ?? ""} onChange={set("openings")} />
                  <Field label="Location" value={form.location ?? ""} onChange={set("location")} />
                </div>
                <Field label="Application deadline" value={form.applicationDeadline ?? ""} onChange={set("applicationDeadline")} type="date" required />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Min CGPA" value={form.minCgpa ?? ""} onChange={set("minCgpa")} placeholder="e.g. 7.0" />
                  <Field label="Max backlogs" value={form.maxBacklogs ?? ""} onChange={set("maxBacklogs")} placeholder="e.g. 0" />
                  <Field label="Min attendance %" value={form.minAttendance ?? ""} onChange={set("minAttendance")} placeholder="e.g. 75" />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function InterviewForm({
  applicationId,
  onClose,
  onSaved,
}: {
  applicationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roundName, setRoundName] = useState("Round 1");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/placements/applications/${applicationId}/interviews`, {
        method: "POST",
        body: { roundName, roundNumber: 1, scheduledAt: new Date(scheduledAt).toISOString(), location },
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-2">
        <input className="border rounded px-2 py-1.5 text-sm" value={roundName} onChange={(e) => setRoundName(e.target.value)} required aria-label="Round name" />
        <input type="datetime-local" className="border rounded px-2 py-1.5 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required aria-label="Scheduled at" />
      </div>
      <input className="w-full border rounded px-2 py-1.5 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location / meeting link" aria-label="Location" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Schedule"}</Button>
        <Button size="sm" variant="outline" type="button" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function OfferForm({
  applicationId,
  onClose,
  onSaved,
}: {
  applicationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [packageAmount, setPackageAmount] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Selection is recorded first: only SELECTED applications take offers.
      await api(`/admin/placements/applications/${applicationId}/status`, {
        method: "PATCH",
        body: { status: "SELECTED" },
      });
      await api(`/admin/placements/applications/${applicationId}/offer`, {
        method: "POST",
        body: { packageAmount: Number(packageAmount), joiningDate: joiningDate || null },
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">Records SELECTED, then creates the offer atomically per step.</p>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min={1} className="border rounded px-2 py-1.5 text-sm" value={packageAmount} onChange={(e) => setPackageAmount(e.target.value)} required placeholder="Package (Rs.)" aria-label="Package amount" />
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} aria-label="Joining date" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Record selection + offer"}</Button>
        <Button size="sm" variant="outline" type="button" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type ?? "text"}
        className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
