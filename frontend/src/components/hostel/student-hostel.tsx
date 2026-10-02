"use client";

import { useState } from "react";
import { BedDouble } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { formatCurrency } from "@/lib/format";
import type { HostelComplaint, HostelVisitor, MyHostel, RoomChangeRequest } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 border-blue-300",
  IN_PROGRESS: "bg-purple-100 text-purple-800 border-purple-300",
  RESOLVED: "bg-green-100 text-green-800 border-green-300",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-300",
  PENDING: "bg-amber-100 text-amber-800 border-amber-300",
  APPROVED: "bg-green-100 text-green-800 border-green-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] ?? ""}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function StudentHostel() {
  const me = useApi<MyHostel>("/hostel/me");
  const complaints = useApi<{ complaints: HostelComplaint[] }>("/hostel/complaints");
  const changes = useApi<{ requests: RoomChangeRequest[] }>("/hostel/room-changes");
  const visitors = useApi<{ visitors: HostelVisitor[] }>("/hostel/visitors");
  const [dialog, setDialog] = useState<"complaint" | "change" | "visitor" | null>(null);

  const reload = () => {
    me.reload();
    complaints.reload();
    changes.reload();
    visitors.reload();
  };

  if (me.error) return <ErrorState message={me.error} onRetry={reload} />;
  if (me.loading) return <LoadingState label="Loading hostel details..." />;

  const allocation = me.data?.allocation ?? null;

  return (
    <div className="space-y-6">
      {allocation ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {allocation.hostel.name} · Room {allocation.room.roomNumber} · Bed {allocation.bedNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <p><span className="text-muted-foreground">Block:</span> {allocation.hostel.block}</p>
            <p><span className="text-muted-foreground">Room type:</span> {allocation.room.roomType} (capacity {allocation.room.capacity})</p>
            <p><span className="text-muted-foreground">Warden:</span> {allocation.hostel.wardenName ?? "—"}</p>
            <p><span className="text-muted-foreground">Since:</span> {allocation.allocatedOn}</p>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Roommates</p>
              {(me.data?.roommates.length ?? 0) === 0 ? (
                <p className="text-sm">No other occupants in this room right now.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {me.data?.roommates.map((m) => (
                    <li key={m.studentNo} className="text-sm">{m.name} ({m.studentNo}) · Bed {m.bedNumber}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="No hostel allocation"
          description="You are currently not allocated a hostel room. Contact the hostel office for allocation."
          icon={<BedDouble className="h-6 w-6" />}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Hostel fees</CardTitle>
        </CardHeader>
        <CardContent>
          {(me.data?.fees.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No hostel fee records.</p>
          ) : (
            <ul className="space-y-2">
              {me.data?.fees.map((fee) => (
                <li key={fee.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{fee.feeType}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(fee.amountPaid)} paid of {formatCurrency(fee.amount)} · Due {fee.dueDate}
                    </p>
                  </div>
                  <Badge variant="outline">{fee.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Fee payments are handled by the institute office.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Complaints</CardTitle>
            <Button size="sm" onClick={() => setDialog("complaint")}>New complaint</Button>
          </CardHeader>
          <CardContent>
            {(complaints.data?.complaints.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No complaints filed.</p>
            ) : (
              <ul className="space-y-2">
                {complaints.data?.complaints.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{c.category} {c.roomNumber ? `· Room ${c.roomNumber}` : ""}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Room-change requests</CardTitle>
            <Button size="sm" onClick={() => setDialog("change")} disabled={!allocation}>Request change</Button>
          </CardHeader>
          <CardContent>
            {(changes.data?.requests.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No room-change requests.</p>
            ) : (
              <ul className="space-y-2">
                {changes.data?.requests.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {r.currentRoomNumber} → {r.requestedRoomNumber ?? "any available room"}
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Visitor requests</CardTitle>
          <Button size="sm" onClick={() => setDialog("visitor")}>New request</Button>
        </CardHeader>
        <CardContent>
          {(visitors.data?.visitors.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No visitor requests.</p>
          ) : (
            <ul className="space-y-2">
              {visitors.data?.visitors.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{v.visitorName} ({v.relation})</p>
                    <p className="text-xs text-muted-foreground">{v.visitDate}{v.visitTime ? ` at ${v.visitTime}` : ""}</p>
                  </div>
                  <StatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <StudentHostelDialog
          kind={dialog}
          hasAllocation={Boolean(allocation)}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function StudentHostelDialog({
  kind,
  hasAllocation,
  onClose,
  onSaved,
}: {
  kind: "complaint" | "change" | "visitor";
  hasAllocation: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const rooms = useApi<{ rooms: Array<{ id: string; hostelName: string; roomNumber: string; vacantBeds: number }> }>(
    kind === "change" ? "/hostel/rooms?status=AVAILABLE" : null,
  );
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [requestedRoomId, setRequestedRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [relation, setRelation] = useState("Family");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = kind === "complaint" ? "New complaint" : kind === "change" ? "Request room change" : "New visitor request";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "complaint") {
        await api("/hostel/complaints", { method: "POST", body: { category, description, priority } });
      } else if (kind === "change") {
        await api("/hostel/room-changes", { method: "POST", body: { requestedRoomId: requestedRoomId || null, reason } });
      } else {
        await api("/hostel/visitors", {
          method: "POST",
          body: { visitorName, relation, visitDate, visitTime: visitTime || null },
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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "complaint" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="hc-cat">Category</label>
                    <select id="hc-cat" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                      {["ELECTRICAL", "PLUMBING", "CLEANING", "FURNITURE", "INTERNET", "OTHER"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="hc-pri">Priority</label>
                    <select id="hc-pri" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
                      {["LOW", "MEDIUM", "HIGH"].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="hc-desc">Description</label>
                  <textarea id="hc-desc" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={2000} />
                </div>
              </>
            )}
            {kind === "change" && (
              <>
                {!hasAllocation && <p className="text-sm text-red-600">An active allocation is required.</p>}
                <div>
                  <label className="text-sm font-medium" htmlFor="hc-room">Preferred room (optional)</label>
                  <select id="hc-room" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={requestedRoomId} onChange={(e) => setRequestedRoomId(e.target.value)}>
                    <option value="">Any available room</option>
                    {(rooms.data?.rooms ?? []).filter((r) => r.vacantBeds > 0).map((r) => (
                      <option key={r.id} value={r.id}>{r.hostelName} · {r.roomNumber} ({r.vacantBeds} vacant)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="hc-reason">Reason</label>
                  <textarea id="hc-reason" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={2000} />
                </div>
              </>
            )}
            {kind === "visitor" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="hv-name">Visitor name</label>
                    <input id="hv-name" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} required minLength={2} maxLength={120} />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="hv-rel">Relation</label>
                    <input id="hv-rel" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={60} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="hv-date">Visit date</label>
                    <input id="hv-date" type="date" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="hv-time">Time (optional)</label>
                    <input id="hv-time" type="time" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
                  </div>
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Submit"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
