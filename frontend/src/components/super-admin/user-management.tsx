"use client";

import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { useAuth } from "@/components/providers/auth-provider";
import { formatDateTime } from "@/lib/format";
import type { AccountStatus, ManagedUser, UserList } from "@/lib/types";

const STATUS_FILTERS: { value: AccountStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
];

const statusBadgeClass: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  SUSPENDED: "bg-red-100 text-red-800 border-red-200",
  REJECTED: "bg-muted text-muted-foreground border-border",
};

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<UserList>(
    `/super-admin/users?status=${status}${appliedSearch ? `&q=${encodeURIComponent(appliedSearch)}` : ""}`,
  );

  const setUserStatus = async (target: ManagedUser, next: "ACTIVE" | "SUSPENDED") => {
    setBusy(target.id);
    setActionError(null);
    setNotice(null);
    try {
      await api(`/super-admin/users/${target.id}/status`, {
        method: "PATCH",
        body: { status: next },
      });
      setNotice(`${target.email} is now ${next === "ACTIVE" ? "active" : "suspended"}.`);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={status === option.value ? "default" : "outline"}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            className="h-8 w-56"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
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

      {loading && <LoadingState label="Loading users..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState title="No users" description="No accounts match this filter." />}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((managed) => (
                  <TableRow key={managed.id}>
                    <TableCell className="font-medium">{managed.name}</TableCell>
                    <TableCell>{managed.email}</TableCell>
                    <TableCell>
                      <Badge>{managed.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass[managed.status] ?? ""}>{managed.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(managed.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {managed.id === currentUser?.id ? (
                        <span className="text-xs text-muted-foreground">Current session</span>
                      ) : managed.role === "SUPER_ADMIN" ? (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      ) : managed.status === "PENDING" ? (
                        <span className="text-xs text-muted-foreground">Awaiting approval</span>
                      ) : managed.status === "SUSPENDED" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === managed.id}
                          onClick={() => setUserStatus(managed, "ACTIVE")}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === managed.id}
                          onClick={() => setUserStatus(managed, "SUSPENDED")}
                        >
                          Suspend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}