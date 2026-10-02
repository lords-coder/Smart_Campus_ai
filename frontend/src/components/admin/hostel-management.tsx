"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type {
  HostelAllocation,
  HostelComplaint,
  HostelDashboard,
  HostelRoom,
  HostelSummary,
  HostelVisitor,
  RoomChangeRequest,
} from "@/lib/types";

type Tab = "rooms" | "allocations" | "complaints" | "changes" | "visitors";

export function HostelManagement() {
  const dashboard = useApi<HostelDashboard>("/admin/hostel/dashboard");
  const [tab, setTab] = useState<Tab>("rooms");
  const [dialog, setDialog] = useState<"hostel" | "room" | "allocate" | null>(null);

  const reload = () => dashboard.reload();

  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={reload} />;
  if (dashboard.loading) return <LoadingState label="Loading hostel overview..." />;

  const totals = dashboard.data?.totals;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Occupancy" value={`${totals?.occupancyPercentage ?? 0}%`} hint={`${totals?.occupiedBeds ?? 0} of ${((totals?.occupiedBeds ?? 0) + (totals?.vacantBeds ?? 0))} beds`} />
        <Stat label="Vacant beds" value={totals?.vacantBeds ?? 0} hint={`${totals?.totalRooms ?? 0} rooms`} />
        <Stat label="Open complaints" value={totals?.openComplaints ?? 0} hint="Needs staff attention" />
        <Stat label="Pending room changes" value={totals?.pendingRoomChanges ?? 0} hint="Awaiting review" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["rooms", "allocations", "complaints", "changes", "visitors"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "changes" ? "Room changes" : t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("hostel")}>New hostel</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("room")}>New room</Button>
          <Button size="sm" onClick={() => setDialog("allocate")}>Allocate student</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Monitoring view for authorized staff — allocation decisions here move students between rooms.
      </p>

      {tab === "rooms" && <RoomsSection hostels={dashboard.data?.hostels ?? []} onChanged={reload} />}
      {tab === "allocations" && <AllocationsSection onChanged={reload} />}
      {tab === "complaints" && <ComplaintsSection onChanged={reload} />}
      {tab === "changes" && <RoomChangesSection onChanged={reload} />}
      {tab === "visitors" && <VisitorsSection onChanged={reload} />}

      {dialog && <HostelDialog kind={dialog} hostels={dashboard.data?.hostels ?? []} onClose={() => setDialog(null)} onSaved={reload} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xs text-gray-400">{hint}</p>
      </CardContent>
    </Card>
  );
}

function RoomsSection({ hostels, onChanged }: { hostels: HostelSummary[]; onChanged: () => void }) {
  const [hostelId, setHostelId] = useState("");
  const { data, loading, error, reload } = useApi<{ rooms: HostelRoom[] }>(
    `/admin/hostel/rooms${hostelId ? `?hostelId=${hostelId}` : ""}`,
  );
  void onChanged;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading rooms..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Rooms ({data?.rooms.length ?? 0})</CardTitle>
        <select className="border rounded px-2 py-1.5 text-sm" value={hostelId} onChange={(e) => setHostelId(e.target.value)} aria-label="Filter by hostel">
          <option value="">All hostels</option>
          {hostels.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Room</th>
                <th className="px-4 py-2 font-medium">Hostel</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Occupancy</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Occupants</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rooms ?? []).map((room) => (
                <tr key={room.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{room.roomNumber}</td>
                  <td className="px-4 py-2">{room.hostelName}</td>
                  <td className="px-4 py-2">{room.roomType}</td>
                  <td className="px-4 py-2">{room.occupiedBeds}/{room.capacity}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{room.status}</Badge></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {room.occupants.length === 0 ? "—" : room.occupants.map((o) => `${o.name} (bed ${o.bedNumber})`).join(", ")}
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

function AllocationsSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ allocations: HostelAllocation[] }>("/admin/hostel/allocations?status=ACTIVE");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  void onChanged;

  async function vacate(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/admin/hostel/allocations/${id}/vacate`, { method: "PATCH" });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading allocations..." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active allocations ({data?.allocations.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {actionError && <p className="text-sm text-red-600 mb-2">{actionError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Hostel</th>
                <th className="px-4 py-2 font-medium">Room / Bed</th>
                <th className="px-4 py-2 font-medium">Since</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.allocations ?? []).map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-2">{a.studentName} <span className="text-xs text-gray-500">({a.studentNo})</span></td>
                  <td className="px-4 py-2">{a.hostelName}</td>
                  <td className="px-4 py-2">{a.roomNumber} / Bed {a.bedNumber}</td>
                  <td className="px-4 py-2">{a.allocatedOn}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <button className="text-sm text-primary hover:underline" onClick={() => setTransferId(a.id)}>Transfer</button>
                    <button className="text-sm text-red-600 hover:underline" disabled={busy === a.id} onClick={() => vacate(a.id)}>Vacate</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transferId && (
          <TransferDialog
            allocationId={transferId}
            onClose={() => setTransferId(null)}
            onSaved={() => { setTransferId(null); reload(); }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TransferDialog({ allocationId, onClose, onSaved }: { allocationId: string; onClose: () => void; onSaved: () => void }) {
  const rooms = useApi<{ rooms: HostelRoom[] }>("/admin/hostel/rooms?status=AVAILABLE");
  const [roomId, setRoomId] = useState("");
  const [bedNumber, setBedNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/hostel/allocations/${allocationId}/transfer`, { method: "POST", body: { roomId, bedNumber } });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Transfer student</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="tr-room">Target room</label>
              <select id="tr-room" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
                <option value="">Select room</option>
                {(rooms.data?.rooms ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.hostelName} · {r.roomNumber} ({r.occupiedBeds}/{r.capacity})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="tr-bed">Bed number</label>
              <input id="tr-bed" type="number" min={1} max={4} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={bedNumber} onChange={(e) => setBedNumber(Number(e.target.value))} required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Moving..." : "Transfer"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplaintsSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ complaints: HostelComplaint[] }>("/admin/hostel/complaints?status=OPEN");
  const [busy, setBusy] = useState<string | null>(null);
  void onChanged;
  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await api(`/admin/hostel/complaints/${id}`, { method: "PATCH", body: { status } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading complaints..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Open complaints ({data?.complaints.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(data?.complaints.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No open complaints.</p>}
        {(data?.complaints ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{c.studentName} · {c.category} {c.roomNumber ? `· Room ${c.roomNumber}` : ""}</p>
              <Badge variant="outline">{c.priority}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
            <div className="mt-2 flex gap-2">
              <button className="text-xs text-primary hover:underline" disabled={busy === c.id} onClick={() => setStatus(c.id, "IN_PROGRESS")}>Start work</button>
              <button className="text-xs text-primary hover:underline" disabled={busy === c.id} onClick={() => setStatus(c.id, "RESOLVED")}>Resolve</button>
              <button className="text-xs text-muted-foreground hover:underline" disabled={busy === c.id} onClick={() => setStatus(c.id, "CLOSED")}>Close</button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoomChangesSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ requests: RoomChangeRequest[] }>("/admin/hostel/room-changes?status=PENDING");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  void onChanged;
  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/admin/hostel/room-changes/${id}/review`, { method: "PATCH", body: { status } });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading requests..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Pending room changes ({data?.requests.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}
        {(data?.requests.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
        {(data?.requests ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{r.studentName} · {r.currentRoomNumber} → {r.requestedRoomNumber ?? "any available room"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
            <div className="mt-2 flex gap-2">
              <button className="text-xs text-primary hover:underline" disabled={busy === r.id} onClick={() => review(r.id, "APPROVED")}>Approve &amp; move</button>
              <button className="text-xs text-red-600 hover:underline" disabled={busy === r.id} onClick={() => review(r.id, "REJECTED")}>Reject</button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function VisitorsSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ visitors: HostelVisitor[] }>("/admin/hostel/visitors?status=PENDING");
  const [busy, setBusy] = useState<string | null>(null);
  void onChanged;
  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await api(`/admin/hostel/visitors/${id}`, { method: "PATCH", body: { status } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading visitors..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Pending visitors ({data?.visitors.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(data?.visitors.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No pending visitor requests.</p>}
        {(data?.visitors ?? []).map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">{v.visitorName} ({v.relation}) → {v.studentName}</p>
              <p className="text-xs text-muted-foreground">{v.visitDate}{v.visitTime ? ` at ${v.visitTime}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button className="text-xs text-primary hover:underline" disabled={busy === v.id} onClick={() => setStatus(v.id, "APPROVED")}>Approve</button>
              <button className="text-xs text-red-600 hover:underline" disabled={busy === v.id} onClick={() => setStatus(v.id, "REJECTED")}>Reject</button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HostelDialog({
  kind,
  hostels,
  onClose,
  onSaved,
}: {
  kind: "hostel" | "room" | "allocate";
  hostels: HostelSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [block, setBlock] = useState("");
  const [category, setCategory] = useState("COED");
  const [wardenName, setWardenName] = useState("");
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("DOUBLE");
  const [capacity, setCapacity] = useState(2);
  const [studentNo, setStudentNo] = useState("");
  const [allocRoomId, setAllocRoomId] = useState("");
  const [bedNumber, setBedNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rooms = useApi<{ rooms: HostelRoom[] }>(kind === "allocate" ? "/admin/hostel/rooms?status=AVAILABLE" : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "hostel") {
        await api("/admin/hostel/hostels", { method: "POST", body: { name, block, category, wardenName: wardenName || null } });
      } else if (kind === "room") {
        await api("/admin/hostel/rooms", { method: "POST", body: { hostelId, roomNumber, roomType, capacity } });
      } else {
        await api("/admin/hostel/allocations", { method: "POST", body: { studentNo, roomId: allocRoomId, bedNumber } });
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{kind === "hostel" ? "New hostel" : kind === "room" ? "New room" : "Allocate student"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "hostel" && (
              <>
                <div>
                  <label className="text-sm font-medium" htmlFor="nh-name">Name</label>
                  <input id="nh-name" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="nh-block">Block</label>
                    <input id="nh-block" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={block} onChange={(e) => setBlock(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="nh-cat">Category</label>
                    <select id="nh-cat" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="COED">Co-ed</option>
                      <option value="BOYS">Boys</option>
                      <option value="GIRLS">Girls</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="nh-warden">Warden name (optional)</label>
                  <input id="nh-warden" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={wardenName} onChange={(e) => setWardenName(e.target.value)} />
                </div>
              </>
            )}
            {kind === "room" && (
              <>
                <div>
                  <label className="text-sm font-medium" htmlFor="nr-hostel">Hostel</label>
                  <select id="nr-hostel" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={hostelId} onChange={(e) => setHostelId(e.target.value)} required>
                    {hostels.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="nr-number">Room no.</label>
                    <input id="nr-number" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="nr-type">Type</label>
                    <select id="nr-type" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={roomType} onChange={(e) => { setRoomType(e.target.value); setCapacity({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 }[e.target.value] ?? 2); }}>
                      {["SINGLE", "DOUBLE", "TRIPLE", "QUAD"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="nr-cap">Capacity</label>
                    <input id="nr-cap" type="number" min={1} max={4} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required />
                  </div>
                </div>
              </>
            )}
            {kind === "allocate" && (
              <>
                <div>
                  <label className="text-sm font-medium" htmlFor="al-student">Student number</label>
                  <input id="al-student" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" placeholder="SC2025-001" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="al-room">Room</label>
                    <select id="al-room" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={allocRoomId} onChange={(e) => setAllocRoomId(e.target.value)} required>
                      <option value="">Select room</option>
                      {(rooms.data?.rooms ?? []).map((r) => (
                        <option key={r.id} value={r.id}>{r.hostelName} · {r.roomNumber} ({r.occupiedBeds}/{r.capacity})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="al-bed">Bed</label>
                    <input id="al-bed" type="number" min={1} max={4} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={bedNumber} onChange={(e) => setBedNumber(Number(e.target.value))} required />
                  </div>
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
