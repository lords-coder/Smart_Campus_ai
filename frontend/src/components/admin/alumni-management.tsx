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

type Tab = "profiles" | "mentorships" | "events" | "campaigns" | "analytics";

export function AlumniManagement() {
  const [tab, setTab] = useState<Tab>("profiles");
  const [dialog, setDialog] = useState<"event" | "campaign" | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["profiles", "mentorships", "events", "campaigns", "analytics"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("event")}>New event</Button>
          <Button size="sm" onClick={() => setDialog("campaign")}>New campaign</Button>
        </div>
      </div>

      <div key={version}>
        {tab === "profiles" && <ProfilesSection />}
        {tab === "mentorships" && <MentorshipsSection />}
        {tab === "events" && <EventsSection />}
        {tab === "campaigns" && <CampaignsSection />}
        {tab === "analytics" && <AnalyticsSection />}
      </div>

      {dialog && (
        <AdminAlumniDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function ProfilesSection() {
  const [verification, setVerification] = useState("all");
  const { data, loading, error, reload } = useApi<{ profiles: Array<Record<string, unknown>> }>(
    `/admin/alumni/profiles${verification === "all" ? "" : `?verification=${verification}`}`,
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function verify(id: string) {
    setBusy(id);
    try {
      await api(`/admin/alumni/profiles/${id}`, { method: "PATCH", body: { verification: "VERIFIED", status: "ALUMNI" } });
      reload();
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading profiles..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Profiles ({data?.profiles.length ?? 0})</CardTitle>
        <select className="border rounded px-2 py-1.5 text-sm" value={verification} onChange={(e) => setVerification(e.target.value)} aria-label="Filter by verification">
          <option value="all">All</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="VERIFIED">Verified</option>
        </select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Alumni</th>
                <th className="px-4 py-2 font-medium">Class</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.profiles ?? []).map((p) => (
                <tr key={p.id as string} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name as string}</td>
                  <td className="px-4 py-2">{p.graduation_year as number} · {p.department as string}</td>
                  <td className="px-4 py-2">{(p.current_company as string) || "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{p.verification as string}</Badge>{" "}
                    <Badge variant="outline">{p.status as string}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    {p.verification !== "VERIFIED" && (
                      <button className="text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === (p.id as string)} onClick={() => verify(p.id as string)}>
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MentorshipsSection() {
  const { data, loading, error, reload } = useApi<{ mentorships: Array<Record<string, unknown>> }>("/admin/alumni/mentorships");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading mentorships..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Mentorships ({data?.mentorships.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        {(data?.mentorships.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No mentorship records.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.mentorships ?? []).map((m) => (
              <li key={m.id as string} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{m.student_name as string} ↔ {m.alumni_name as string}</p>
                  <p className="text-xs text-muted-foreground">{m.topic as string} · requested {(m.requested_at as string).slice(0, 10)}</p>
                </div>
                <Badge variant="outline">{m.status as string}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EventsSection() {
  const { data, loading, error, reload } = useApi<{ events: Array<Record<string, unknown>> }>("/admin/alumni/events");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function publish(id: string) {
    setBusy(id);
    try {
      await api(`/admin/alumni/events/${id}`, { method: "PATCH", body: { status: "PUBLISHED" } });
      reload();
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading events..." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Events ({data?.events.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(data?.events ?? []).map((e) => (
              <li key={e.id as string}>
                <button
                  onClick={() => setSelectedId(e.id as string)}
                  className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedId === (e.id as string) ? "border-primary" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{e.title as string}</p>
                    <Badge variant="outline">{e.status as string}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{(e.starts_at as string).slice(0, 16).replace("T", " ")} · {e.location as string}</p>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div>
        {!selectedId ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Select an event to publish it or view registrations.</p>
            </CardContent>
          </Card>
        ) : (
          <EventDetailPanel
            eventId={selectedId}
            onPublish={publish}
            publishing={busy === selectedId}
          />
        )}
      </div>
    </div>
  );
}

function EventDetailPanel({ eventId, onPublish, publishing }: { eventId: string; onPublish: (id: string) => void; publishing: boolean }) {
  const { data, loading, error, reload } = useApi<{
    registrations: Array<{ id: string; userName: string; userRole: string; status: string; registeredAt: string }>;
  }>(`/admin/alumni/events/${eventId}/registrations`);
  const [busy, setBusy] = useState<string | null>(null);

  async function attend(id: string) {
    setBusy(id);
    try {
      await api(`/admin/alumni/registrations/${id}/attend`, { method: "PATCH" });
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Registrations ({data?.registrations.length ?? 0})</CardTitle>
        <Button size="sm" variant="outline" disabled={publishing} onClick={() => onPublish(eventId)}>
          {publishing ? "Publishing..." : "Publish"}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <LoadingState label="Loading registrations..." />
        ) : (data?.registrations.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No registrations yet.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.registrations ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-3">
                <div>
                  <p className="font-medium">{r.userName} <span className="text-xs text-gray-500">({r.userRole})</span></p>
                  <p className="text-xs text-muted-foreground">{r.registeredAt.slice(0, 10)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  {r.status === "REGISTERED" && (
                    <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => attend(r.id)}>
                      Mark attended
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignsSection() {
  const campaigns = useApi<{ campaigns: Array<Record<string, unknown>> }>("/admin/alumni/campaigns");
  const contributions = useApi<{ contributions: Array<Record<string, unknown>> }>("/admin/alumni/contributions");
  const [busy, setBusy] = useState<string | null>(null);

  async function record(id: string) {
    setBusy(id);
    try {
      await api(`/admin/alumni/contributions/${id}`, { method: "PATCH", body: { status: "RECORDED" } });
      contributions.reload();
      campaigns.reload();
    } finally {
      setBusy(null);
    }
  }

  if (campaigns.error) return <ErrorState message={campaigns.error} onRetry={campaigns.reload} />;
  if (campaigns.loading) return <LoadingState label="Loading campaigns..." />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Campaigns ({campaigns.data?.campaigns.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(campaigns.data?.campaigns ?? []).map((c) => (
              <li key={c.id as string} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.title as string}</p>
                  <Badge variant="outline">{c.status as string}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Target {formatCurrency(Number(c.targetAmount ?? c.target_amount ?? 0))}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Contributions ({contributions.data?.contributions.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {(contributions.data?.contributions.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No contributions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {(contributions.data?.contributions ?? []).map((c) => (
                <li key={c.id as string} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{formatCurrency(Number(c.amount))} · {c.alumniName as string}</p>
                    <p className="text-xs text-muted-foreground">{(c.createdAt as string)?.slice(0, 10) ?? (c.created_at as string)?.slice(0, 10)}{c.reference ? ` · ref ${c.reference}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.status as string}</Badge>
                    {c.status === "PLEDGED" && (
                      <button className="text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === (c.id as string)} onClick={() => record(c.id as string)}>
                        Mark recorded
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsSection() {
  const { data, loading, error, reload } = useApi<{
    total: number;
    verified: number;
    mentors: number;
    byGraduationYear: Array<{ year: number; count: number }>;
    byDepartment: Array<{ department: string; count: number }>;
    byIndustry: Array<{ industry: string; count: number }>;
    mentorship: { requested: number; active: number; completed: number };
    publishedEvents: number;
    eventRegistrations: number;
    recordedContributions: number;
  }>("/admin/alumni/analytics");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading analytics..." />;
  const cards = [
    { label: "Total alumni", value: data?.total ?? 0, hint: `${data?.verified ?? 0} verified` },
    { label: "Active mentors", value: data?.mentors ?? 0, hint: `${data?.mentorship.requested ?? 0} requests pending` },
    { label: "Mentorships active", value: data?.mentorship.active ?? 0, hint: `${data?.mentorship.completed ?? 0} completed` },
    { label: "Published events", value: data?.publishedEvents ?? 0, hint: `${data?.eventRegistrations ?? 0} registrations` },
    { label: "Recorded contributions", value: formatCurrency(data?.recordedContributions ?? 0), hint: "Pledged amounts excluded" },
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
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <BreakdownCard title="By graduation year" rows={(data?.byGraduationYear ?? []).map((r) => [`${r.year}`, r.count])} />
        <BreakdownCard title="By department" rows={(data?.byDepartment ?? []).map((r) => [r.department, r.count])} />
        <BreakdownCard title="By industry" rows={(data?.byIndustry ?? []).map((r) => [r.industry, r.count])} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Aggregates only — no individual records in this report.</p>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map(([label, count]) => (
              <li key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdminAlumniDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: "event" | "campaign";
  onClose: () => void;
  onSaved: () => void;
}) {
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
      if (kind === "event") {
        const startsAt = new Date(form.startsAt).toISOString();
        await api("/admin/alumni/events", {
          method: "POST",
          body: { title: form.title, description: form.description || "", location: form.location || "", startsAt, capacity: Number(form.capacity || 100), audience: form.audience || "ALL" },
        });
      } else {
        await api("/admin/alumni/campaigns", {
          method: "POST",
          body: { title: form.title, description: form.description || "", targetAmount: Number(form.targetAmount || 0) },
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
        <CardHeader><CardTitle>{kind === "event" ? "New event" : "New campaign"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <input className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.title ?? ""} onChange={set("title")} required minLength={3} />
            </div>
            {kind === "event" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Starts at</label>
                    <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.startsAt ?? ""} onChange={set("startsAt")} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Capacity</label>
                    <input type="number" min={1} max={10000} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.capacity ?? ""} onChange={set("capacity")} required />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Location</label>
                  <input className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.location ?? ""} onChange={set("location")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Audience</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.audience ?? "ALL"} onChange={set("audience")}>
                    <option value="ALL">Everyone</option>
                    <option value="STUDENTS">Students</option>
                    <option value="ALUMNI">Alumni</option>
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm font-medium">Target amount (Rs.)</label>
                <input type="number" min={0} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.targetAmount ?? ""} onChange={set("targetAmount")} required />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea className="mt-1 w-full border rounded px-2 py-1.5 text-sm" rows={3} value={form.description ?? ""} onChange={set("description")} maxLength={5000} />
            </div>
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
