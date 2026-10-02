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
import type { PasswordHelpList, PasswordHelpRequest, PasswordHelpStatus, PasswordResetIssue } from "@/lib/types";

const FILTERS: { value: PasswordHelpStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
];

const statusBadgeClass: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800 border-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  RESOLVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-muted text-muted-foreground border-border",
};

export function PasswordAssistance() {
  const [filter, setFilter] = useState<PasswordHelpStatus | "ALL">("OPEN");
  const [active, setActive] = useState<PasswordHelpRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuedLink, setIssuedLink] = useState<PasswordResetIssue | null>(null);

  const { data, loading, error, reload } = useApi<PasswordHelpList>(`/super-admin/password-help?status=${filter}`);

  const patch = async (request: PasswordHelpRequest, status: PasswordHelpStatus, message: string) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await api(`/super-admin/password-help/${request.id}`, {
        method: "PATCH",
        body: { status, adminNotes: notes.trim() || undefined },
      });
      setNotice(message);
      setActive(null);
      setNotes("");
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const issueReset = async (request: PasswordHelpRequest) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await api<PasswordResetIssue>(`/super-admin/password-help/${request.id}/reset`, {
        method: "POST",
      });
      setIssuedLink(result);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(false);
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

      {issuedLink && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">Reset link issued (shown once, valid 24 hours)</p>
            <p className="mt-1 break-all text-xs">{issuedLink.resetUrl}</p>
            <p className="mt-1 text-xs">
              Share it with the requester through a trusted channel. This is the only time the link is
              displayed.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {loading && <LoadingState label="Loading help requests..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <EmptyState title="No help requests" description="Nobody is waiting for account assistance." />
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.userName ?? "Unknown"}</TableCell>
                    <TableCell>{request.userEmail}</TableCell>
                    <TableCell>{request.requesterRole ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={request.message}>
                      {request.message}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass[request.status] ?? ""}>{request.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActive(request);
                          setNotes(request.adminNotes ?? "");
                          setIssuedLink(null);
                        }}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Handle request — {active.userEmail}</h2>
              <Button type="button" size="sm" variant="ghost" onClick={() => setActive(null)}>
                Close
              </Button>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Requester</dt>
                <dd className="font-medium">{active.userName ?? "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{active.requesterRole ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="font-medium">{active.message}</dd>
              </div>
              {active.contact && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="font-medium">{active.contact}</dd>
                </div>
              )}
            </dl>

            <p className="text-xs text-muted-foreground">
              Passwords and password hashes are never shown here. Issue a reset link instead — the
              requester sets their own new password and the old one stops working immediately.
            </p>

            <Textarea
              rows={3}
              placeholder="Internal note (optional)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />

            <div className="flex flex-wrap gap-2 pt-2">
              {active.status === "OPEN" && (
                <Button type="button" disabled={busy} onClick={() => patch(active, "IN_PROGRESS", "Request marked in progress.")}>
                  Mark in progress
                </Button>
              )}
              <Button type="button" variant="outline" disabled={busy} onClick={() => issueReset(active)}>
                Issue reset link
              </Button>
              <Button type="button" disabled={busy} onClick={() => patch(active, "RESOLVED", "Request marked resolved.")}>
                Mark resolved
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => patch(active, "REJECTED", "Request rejected.")}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}