"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { CertificateRequest } from "@/lib/types";

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED" | "ISSUED" | "REVOKED";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-300",
  APPROVED: "bg-blue-100 text-blue-800 border-blue-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  ISSUED: "bg-green-100 text-green-800 border-green-300",
  REVOKED: "bg-gray-100 text-gray-600 border-gray-300",
};

const TYPE_FILTERS = ["all", "BONAFIDE", "TRANSCRIPT", "CONDUCT", "ENROLLMENT"] as const;
const STATUS_FILTERS: StatusFilter[] = ["all", "PENDING", "APPROVED", "REJECTED", "ISSUED", "REVOKED"];

interface RequestDetail {
  request: CertificateRequest;
  student: {
    studentId: string;
    studentNo: string;
    name: string;
    department: string;
    semester: number;
    section: string;
  };
  academic: { attendancePercentage: number | null; enrolledCourses: number };
}

export function CertificateManagement() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [certType, setCertType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = [
    status !== "all" ? `status=${status}` : "",
    certType !== "all" ? `certificateType=${certType}` : "",
    appliedSearch ? `q=${encodeURIComponent(appliedSearch)}` : "",
  ].filter(Boolean).join("&");

  const { data, loading, error, reload } = useApi<{ requests: CertificateRequest[] }>(
    `/admin/certificates/requests${query ? `?${query}` : ""}`,
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading certificate requests..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => setStatus(s)}>
            {s === "all" ? "All statuses" : s}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <Button key={t} variant={certType === t ? "default" : "outline"} size="sm" onClick={() => setCertType(t)}>
            {t === "all" ? "All types" : t}
          </Button>
        ))}
        <input
          className="border rounded px-2 py-1.5 text-sm"
          placeholder="Search name, number, email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setAppliedSearch(search);
          }}
          aria-label="Search requests"
        />
        <Button size="sm" variant="outline" onClick={() => setAppliedSearch(search)}>Search</Button>
        {(status !== "all" || certType !== "all" || appliedSearch) && (
          <button
            className="text-sm text-primary hover:underline px-2"
            onClick={() => { setStatus("all"); setCertType("all"); setSearch(""); setAppliedSearch(""); }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests ({data?.requests.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.requests.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No requests match the current filters.</p>
            ) : (
              <ul className="space-y-2">
                {(data?.requests ?? []).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedId === r.id ? "border-primary" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{r.studentName} · {r.certificateType}</p>
                        <Badge variant="outline" className={STATUS_STYLES[r.status] ?? ""}>{r.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.studentNo} · Requested {r.createdAt.slice(0, 10)}
                        {r.purpose ? ` · ${r.purpose.slice(0, 60)}` : ""}
                      </p>
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
                <p className="text-sm text-muted-foreground">Select a request to review it.</p>
              </CardContent>
            </Card>
          ) : (
            <RequestDetailPanel requestId={selectedId} onChanged={reload} />
          )}
        </div>
      </div>
    </div>
  );
}

function RequestDetailPanel({ requestId, onChanged }: { requestId: string; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<RequestDetail>(`/admin/certificates/requests/${requestId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(kind: "approve" | "reject" | "issue" | "revoke", certificateId?: string) {
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === "approve") {
        await api(`/admin/certificates/requests/${requestId}/approve`, { method: "PATCH" });
      } else if (kind === "reject") {
        await api(`/admin/certificates/requests/${requestId}/reject`, {
          method: "PATCH",
          body: { rejectionReason },
        });
        setShowReject(false);
        setRejectionReason("");
      } else if (kind === "issue") {
        await api(`/admin/certificates/requests/${requestId}/issue`, { method: "POST" });
      } else if (certificateId) {
        await api(`/admin/certificates/${certificateId}/revoke`, { method: "PATCH" });
      }
      reload();
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading request..." />;
  if (!data) return null;

  const { request, student, academic } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{request.certificateType} · {student.name}</span>
          <Badge variant="outline" className={STATUS_STYLES[request.status] ?? ""}>{request.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <p><span className="text-muted-foreground">Student no:</span> {student.studentNo}</p>
          <p><span className="text-muted-foreground">Program:</span> {student.department}, Sem {student.semester}, Sec {student.section}</p>
          <p><span className="text-muted-foreground">Requested:</span> {request.createdAt.slice(0, 10)}</p>
          <p><span className="text-muted-foreground">Attendance:</span> {academic.attendancePercentage ?? "—"}% · {academic.enrolledCourses} courses</p>
        </div>
        {request.purpose && (
          <p><span className="text-muted-foreground">Purpose:</span> {request.purpose}</p>
        )}
        {request.rejectionReason && (
          <p className="text-red-700"><span className="font-medium">Rejection reason:</span> {request.rejectionReason}</p>
        )}
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}

        {request.status === "PENDING" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => act("approve")}>
              {busy === "approve" ? "Approving..." : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject((v) => !v)}>Reject</Button>
          </div>
        )}
        {showReject && request.status === "PENDING" && (
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium" htmlFor="reject-reason">Rejection reason (required)</label>
            <textarea
              id="reject-reason"
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              minLength={5}
              maxLength={2000}
            />
            <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => act("reject")}>
              {busy === "reject" ? "Rejecting..." : "Confirm rejection"}
            </Button>
          </div>
        )}
        {request.status === "APPROVED" && (
          <Button size="sm" disabled={busy !== null} onClick={() => act("issue")}>
            {busy === "issue" ? "Issuing..." : "Issue certificate"}
          </Button>
        )}
        {(request.status === "ISSUED" || request.status === "REVOKED") && request.certificateId && (
          <div className="flex flex-wrap items-center gap-2">
            {request.status === "ISSUED" && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("revoke", request.certificateId ?? undefined)}>
                {busy === "revoke" ? "Revoking..." : "Revoke certificate"}
              </Button>
            )}
            {request.status === "REVOKED" && (
              <Badge variant="outline" className={STATUS_STYLES.REVOKED}>REVOKED</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
