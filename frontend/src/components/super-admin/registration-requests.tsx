"use client";

import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/format";
import type { Registration, RegistrationList, RegistrationStatus } from "@/lib/types";

const FILTERS: { value: RegistrationStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING_APPROVAL", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const roleBadgeClass: Record<string, string> = {
  STUDENT: "bg-sky-100 text-sky-800 border-sky-200",
  FACULTY: "bg-violet-100 text-violet-800 border-violet-200",
  ADMIN: "bg-amber-100 text-amber-800 border-amber-200",
};

const statusBadgeClass: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  REGISTRATION_STARTED: "bg-muted text-muted-foreground border-border",
};

/** Never show the stored secret material — registration codes are not returned by the API. */
const HIDDEN_FIELDS = new Set(["password", "confirmPassword", "code"]);

function readableSubmission(submission: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(submission)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      value: value === null || value === undefined || value === "" ? "—" : String(value),
    }));
}

export function RegistrationRequests() {
  const [filter, setFilter] = useState<RegistrationStatus | "ALL">("PENDING_APPROVAL");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<RegistrationList>(
    `/super-admin/registrations?status=${filter}`,
  );

  const run = async (id: string, path: string, body?: unknown, successMessage?: string) => {
    setBusy(id);
    setActionError(null);
    setNotice(null);
    try {
      await api(path, { method: "PATCH", body });
      if (successMessage) setNotice(successMessage);
      setRejecting(null);
      setReason("");
      setSelected(null);
      // The reviewed row no longer belongs to a pending-only view, so widen the
      // filter and let the reviewer see the new state.
      setFilter("ALL");
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => reload()}>
          Refresh
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {loading && <LoadingState label="Loading registrations..." />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.items.length === 0 && (
        <EmptyState title="No registrations" description={`No ${filter.toLowerCase().replace("_", " ")} registrations right now.`} />
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested role</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((registration) => (
                  <TableRow key={registration.id}>
                    <TableCell className="font-medium">{registration.userName}</TableCell>
                    <TableCell>{registration.userEmail}</TableCell>
                    <TableCell>
                      <Badge className={roleBadgeClass[registration.requestedRole] ?? ""}>
                        {registration.requestedRole}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(registration.createdAt)}</TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass[registration.status] ?? ""}>
                        {registration.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(registration)}>
                          View
                        </Button>
                        {registration.status === "PENDING_APPROVAL" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy === registration.id}
                              onClick={() => run(registration.id, `/super-admin/registrations/${registration.id}/approve`, undefined, "Registration approved — the account can now sign in.")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy === registration.id}
                              onClick={() => setRejecting(registration)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Registration detail</h2>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{selected.userName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{selected.userEmail}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requested role</dt>
                <dd className="font-medium">{selected.requestedRole}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="font-medium">{formatDateTime(selected.createdAt)}</dd>
              </div>
              {selected.reviewedAt && (
                <div>
                  <dt className="text-muted-foreground">Reviewed</dt>
                  <dd className="font-medium">{formatDateTime(selected.reviewedAt)}</dd>
                </div>
              )}
              {selected.rejectionReason && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Rejection reason</dt>
                  <dd className="font-medium">{selected.rejectionReason}</dd>
                </div>
              )}
            </dl>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Submitted information</p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {readableSubmission(selected.submission).map((field) => (
                  <div key={field.label}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="font-medium">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {selected.status === "PENDING_APPROVAL" && (
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  disabled={busy === selected.id}
                  onClick={() => run(selected.id, `/super-admin/registrations/${selected.id}/approve`, undefined, "Registration approved.")}
                >
                  Approve
                </Button>
                <Button type="button" variant="outline" onClick={() => setRejecting(selected)}>
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rejecting && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Reject {rejecting.userEmail}</h2>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
            </div>
            <Textarea
              rows={3}
              placeholder="Reason shown to the applicant (optional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={busy === rejecting.id}
              onClick={() =>
                run(
                  rejecting.id,
                  `/super-admin/registrations/${rejecting.id}/reject`,
                  reason.trim() ? { reason: reason.trim() } : {},
                  "Registration rejected — the applicant cannot sign in.",
                )
              }
            >
              Reject registration
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}