"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import type { AdminParentRow, ParentInvitationRow } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-300",
  ACCEPTED: "bg-green-100 text-green-800 border-green-300",
  REVOKED: "bg-gray-100 text-gray-600 border-gray-300",
  EXPIRED: "bg-red-100 text-red-800 border-red-300",
};

export function ParentManagement() {
  const parents = useApi<{ parents: AdminParentRow[] }>("/admin/parents");
  const invitations = useApi<{ invitations: ParentInvitationRow[] }>("/admin/parents/invitations");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = () => {
    parents.reload();
    invitations.reload();
  };

  async function revokeInvitation(id: string) {
    setActionError(null);
    try {
      await api(`/admin/parents/invitations/${id}/revoke`, { method: "PATCH" });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  }

  async function revokeLink(linkId: string) {
    setActionError(null);
    try {
      await api(`/admin/parents/links/${linkId}`, { method: "PATCH", body: { status: "REVOKED" } });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  }

  if (parents.error || invitations.error) {
    return <ErrorState message={parents.error ?? invitations.error ?? "Failed to load"} onRetry={reload} />;
  }
  if (parents.loading || invitations.loading) {
    return <LoadingState label="Loading parent accounts..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => { setCreatedToken(null); setDialogOpen(true); }}>
          Create invitation
        </Button>
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Parent accounts ({parents.data?.parents.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(parents.data?.parents.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No parent accounts yet. Create an invitation to onboard one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Parent</th>
                    <th className="px-4 py-2 font-medium">Linked students</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parents.data?.parents.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-2">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </td>
                      <td className="px-4 py-2">
                        {p.linkedStudents.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {p.linkedStudents.map((s) => (
                              <li key={s.linkId} className="flex items-center gap-2 text-xs">
                                <span>{s.name} · {s.studentNo} · {s.section}</span>
                                <button
                                  className="text-red-600 hover:underline"
                                  onClick={() => revokeLink(s.linkId)}
                                  title="Revoke link"
                                >
                                  Revoke
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations ({invitations.data?.invitations.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(invitations.data?.invitations.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Parent email</th>
                    <th className="px-4 py-2 font-medium">Student</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.data?.invitations.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-4 py-2">{inv.parentEmail}</td>
                      <td className="px-4 py-2">{inv.studentName} · {inv.studentNo}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={STATUS_STYLES[inv.expired ? "EXPIRED" : inv.status] ?? ""}>
                          {inv.expired ? "EXPIRED" : inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{inv.expiresAt.slice(0, 10)}</td>
                      <td className="px-4 py-2">
                        {inv.status === "PENDING" && !inv.expired ? (
                          <button className="text-sm text-red-600 hover:underline" onClick={() => revokeInvitation(inv.id)}>
                            Revoke
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <InvitationDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(token) => { setCreatedToken(token); reload(); }}
        />
      )}

      {createdToken && (
        <Card className="border-green-300 bg-green-50">
          <CardHeader>
            <CardTitle className="text-base">Invitation created — share this link once</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This full token is shown only here, to the administrator. Share it with the parent through a trusted channel.
            </p>
            <code className="block break-all rounded bg-white p-2 text-xs">
              {typeof window !== "undefined" ? `${window.location.origin}/parent/activate?token=${createdToken}` : createdToken}
            </code>
            <Button size="sm" variant="outline" onClick={() => setCreatedToken(null)}>Done</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InvitationDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (token: string) => void }) {
  const [studentNo, setStudentNo] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [relationshipType, setRelationshipType] = useState("PARENT");
  const [students, setStudents] = useState<Array<{ id: string; studentNo: string; name: string }>>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookupStudent() {
    setLookupError(null);
    setStudents([]);
    try {
      // Admin fee register search doubles as a student finder (name/no/email).
      const data = await api<{ records: Array<{ student: { id: string; studentNo: string; name: string; email: string } }> }>(
        `/fees?q=${encodeURIComponent(studentNo)}`,
      );
      const seen = new Map<string, { id: string; studentNo: string; name: string }>();
      for (const r of data.records) {
        // student.id here is the profile id used across academic records.
        seen.set(r.student.id, { id: r.student.id, studentNo: r.student.studentNo, name: r.student.name });
      }
      setStudents([...seen.values()]);
      if (seen.size === 0) setLookupError("No student found. Try the student number (e.g. SC2025-001).");
    } catch (err) {
      setLookupError(apiErrorMessage(err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = students.find((s) => s.studentNo.toLowerCase() === studentNo.trim().toLowerCase()) ?? students[0];
    if (!target) {
      setError("Look up the student first, then create the invitation.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ invitation: { id: string }; token: string }>("/admin/parents/invitations", {
        method: "POST",
        body: { studentId: target.id, parentEmail, relationshipType },
      });
      onCreated(data.token);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create parent invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="inv-student">Student number</label>
              <div className="flex gap-2">
                <input
                  id="inv-student"
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="SC2025-001"
                  value={studentNo}
                  onChange={(e) => setStudentNo(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={lookupStudent}>Find</Button>
              </div>
              {lookupError && <p className="text-xs text-red-600 mt-1">{lookupError}</p>}
              {students.length > 0 && (
                <p className="text-xs text-green-700 mt-1">Found: {students.map((s) => `${s.name} (${s.studentNo})`).join(", ")}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="inv-email">Parent email</label>
              <input
                id="inv-email"
                type="email"
                required
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                placeholder="parent@example.com"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="inv-rel">Relationship</label>
              <select
                id="inv-rel"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value)}
              >
                <option value="PARENT">Parent</option>
                <option value="GUARDIAN">Guardian</option>
                <option value="SPONSOR">Sponsor</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Generate invitation"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
