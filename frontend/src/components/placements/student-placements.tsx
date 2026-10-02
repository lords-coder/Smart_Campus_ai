"use client";

import { useState } from "react";
import { Briefcase } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/components/providers/auth-provider";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { formatCurrency } from "@/lib/format";
import type { PlacementApplication, PlacementDrive } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  APPLIED: "bg-blue-100 text-blue-800 border-blue-300",
  SHORTLISTED: "bg-purple-100 text-purple-800 border-purple-300",
  INTERVIEW: "bg-amber-100 text-amber-800 border-amber-300",
  SELECTED: "bg-green-100 text-green-800 border-green-300",
  WAITLISTED: "bg-yellow-100 text-yellow-800 border-yellow-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  WITHDRAWN: "bg-gray-100 text-gray-600 border-gray-300",
};

export function StudentPlacements() {
  const { user } = useAuth();
  const readOnly = user?.role !== "STUDENT";
  const drives = useApi<{ drives: PlacementDrive[] }>("/placements/drives");
  const applications = useApi<{ applications: PlacementApplication[] }>(readOnly ? null : "/placements/applications");
  const history = useApi<{ history: PlacementApplication[] }>(readOnly ? null : "/placements/history");
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);

  const reloadAll = () => {
    drives.reload();
    applications.reload();
    history.reload();
  };

  if (drives.error) return <ErrorState message={drives.error} onRetry={drives.reload} />;
  if (drives.loading) return <LoadingState label="Loading placement drives..." />;

  const items = drives.data?.drives ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Open drives ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open drives right now. Check back later.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((drive) => (
                <li key={drive.id}>
                  <button
                    onClick={() => setSelectedDrive(drive.id)}
                    className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedDrive === drive.id ? "border-primary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{drive.jobRole}</p>
                      {drive.myApplicationStatus ? (
                        <Badge variant="outline" className={STATUS_STYLES[drive.myApplicationStatus] ?? ""}>
                          {drive.myApplicationStatus}
                        </Badge>
                      ) : drive.eligibility?.eligible ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Eligible</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Not eligible</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{drive.companyName} · {drive.location} · {drive.workMode}</p>
                    <p className="mt-1 text-xs">
                      {formatCurrency(drive.packageMin)} – {formatCurrency(drive.packageMax)} · deadline {drive.applicationDeadline}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedDrive && (
        <DriveDetailPanel driveId={selectedDrive} readOnly={readOnly} onClose={() => setSelectedDrive(null)} onChanged={reloadAll} />
      )}

      {!readOnly && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>My applications ({applications.data?.applications.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {applications.loading ? (
                <LoadingState label="Loading applications..." />
              ) : (applications.data?.applications.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No applications yet. Apply to an eligible drive above.</p>
              ) : (
                <ul className="space-y-2">
                  {(applications.data?.applications ?? []).map((app) => (
                    <ApplicationRow key={app.id} app={app} onChanged={reloadAll} allowWithdraw />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Placement history</CardTitle>
            </CardHeader>
            <CardContent>
              {history.loading ? (
                <LoadingState label="Loading history..." />
              ) : (history.data?.history.length ?? 0) === 0 ? (
                <EmptyState
                  title="No placements yet"
                  description="Selections with offers will appear here."
                  icon={<Briefcase className="h-6 w-6" />}
                />
              ) : (
                <ul className="space-y-2">
                  {(history.data?.history ?? []).map((app) => (
                    <li key={app.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{app.jobRole} · {app.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {app.offers.map((o) => `${formatCurrency(o.packageAmount)} (${o.offerStatus})`).join(" · ") || "No offer recorded"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DriveDetailPanel({
  driveId,
  readOnly,
  onClose,
  onChanged,
}: {
  driveId: string;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useApi<{ drive: PlacementDrive; eligibility: PlacementDrive["eligibility"] }>(
    `/placements/drives/${driveId}`,
  );
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function apply() {
    setSaving(true);
    setActionError(null);
    try {
      await api(`/placements/drives/${driveId}/apply`, { method: "POST" });
      setApplied(true);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{loading ? "Loading drive..." : data?.drive.jobRole}</CardTitle>
        <button className="text-sm text-muted-foreground hover:underline" onClick={onClose}>Close</button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingState label="Loading drive details..." />
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {data.drive.companyName} · {data.drive.location} · {data.drive.workMode} · {data.drive.employmentType}
            </p>
            <p>
              Package {formatCurrency(data.drive.packageMin)} – {formatCurrency(data.drive.packageMax)} · {data.drive.openings} opening(s) ·
              deadline {data.drive.applicationDeadline}
            </p>
            {data.drive.description && <p className="text-muted-foreground">{data.drive.description}</p>}
            <div className="rounded-lg border p-3">
              <p className="font-medium">
                {data.eligibility?.eligible ? (
                  <span className="text-emerald-700">Eligible — you can apply</span>
                ) : (
                  <span className="text-red-700">Not eligible</span>
                )}
              </p>
              {(data.eligibility?.reasons.length ?? 0) > 0 ? (
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
                  {data.eligibility?.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  CGPA {data.eligibility?.standing.cgpa} · backlogs {data.eligibility?.standing.backlogs} ·
                  attendance {data.eligibility?.standing.attendancePercentage}%
                </p>
              )}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={apply} disabled={saving || applied || !data.eligibility?.eligible}>
                  {applied ? "Applied" : saving ? "Applying..." : "Apply now"}
                </Button>
                {actionError && <span className="text-xs text-red-600">{actionError}</span>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ApplicationRow({
  app,
  onChanged,
  allowWithdraw,
}: {
  app: PlacementApplication;
  onChanged: () => void;
  allowWithdraw: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await api(`/placements/applications/${app.id}/withdraw`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canWithdraw = allowWithdraw && (app.status === "APPLIED" || app.status === "SHORTLISTED");

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{app.jobRole} · {app.companyName}</p>
          <p className="text-xs text-muted-foreground">Applied {app.appliedAt.slice(0, 10)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_STYLES[app.status] ?? ""}>{app.status}</Badge>
          {canWithdraw && (
            <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy} onClick={withdraw}>
              {busy ? "Withdrawing..." : "Withdraw"}
            </button>
          )}
        </div>
      </div>
      {app.interviews.length > 0 && (
        <ul className="mt-2 space-y-1">
          {app.interviews.map((iv) => (
            <li key={iv.id} className="text-xs text-muted-foreground">
              {iv.roundName} · {iv.scheduledAt.slice(0, 16).replace("T", " ")} · {iv.location || "TBA"} · {iv.status}
            </li>
          ))}
        </ul>
      )}
      {app.offers.length > 0 && (
        <ul className="mt-2 space-y-1">
          {app.offers.map((offer) => (
            <li key={offer.id} className="text-xs font-medium">
              Offer {formatCurrency(offer.packageAmount)} · {offer.offerStatus}
              {offer.joiningDate ? ` · joining ${offer.joiningDate}` : ""}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}
