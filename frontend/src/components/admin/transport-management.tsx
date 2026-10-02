"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { formatTime, trackingStatusColor, trackingStatusLabel } from "@/lib/format";
import type {
  TransportAlert,
  TransportAssignment,
  TransportDashboard,
  TransportRoute,
  TransportStop,
  TransportVehicle,
  VehicleTracking,
} from "@/lib/types";

type Tab = "vehicles" | "routes" | "assignments" | "alerts" | "tracking";

export function TransportManagement() {
  const dashboard = useApi<TransportDashboard>("/admin/transport/dashboard");
  const [tab, setTab] = useState<Tab>("vehicles");
  const [dialog, setDialog] = useState<"vehicle" | "driver" | "route" | "stop" | "assign" | "alert" | null>(null);

  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  if (dashboard.loading) return <LoadingState label="Loading transport overview..." />;

  const fleet = dashboard.data?.fleet;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Fleet vehicles" value={fleet?.total ?? 0} hint={`${fleet?.ACTIVE ?? 0} active · ${fleet?.MAINTENANCE ?? 0} maintenance`} />
        <Stat label="Active routes" value={dashboard.data?.routes.active ?? 0} hint={`${dashboard.data?.routes.total ?? 0} total routes`} />
        <Stat label="Assigned students" value={dashboard.data?.assignedStudents ?? 0} hint={`${dashboard.data?.activePasses ?? 0} active passes`} />
        <Stat label="Active alerts" value={dashboard.data?.activeAlerts ?? 0} hint="Across all routes" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["vehicles", "routes", "assignments", "alerts", "tracking"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("vehicle")}>New vehicle</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("driver")}>New driver</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("route")}>New route</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("stop")}>New stop</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("alert")}>New alert</Button>
          <Button size="sm" onClick={() => setDialog("assign")}>Assign student</Button>
        </div>
      </div>

      {tab === "vehicles" && <VehiclesSection onChanged={dashboard.reload} />}
      {tab === "routes" && <RoutesSection onChanged={dashboard.reload} />}
      {tab === "assignments" && <AssignmentsSection onChanged={dashboard.reload} />}
      {tab === "alerts" && <AlertsSection onChanged={dashboard.reload} />}
      {tab === "tracking" && <TrackingSection />}

      {dialog && <TransportDialog kind={dialog} onClose={() => setDialog(null)} onSaved={dashboard.reload} />}
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

function VehiclesSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ vehicles: TransportVehicle[] }>("/admin/transport/vehicles");
  const [busy, setBusy] = useState<string | null>(null);
  void onChanged;
  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await api(`/admin/transport/vehicles/${id}`, { method: "PATCH", body: { status } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading fleet..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Fleet ({data?.vehicles.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Registration</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Capacity</th>
                <th className="px-4 py-2 font-medium">Driver</th>
                <th className="px-4 py-2 font-medium">Riders</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.vehicles ?? []).map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-4 py-2 font-mono font-medium">{v.registrationNumber}</td>
                  <td className="px-4 py-2">{v.vehicleType}</td>
                  <td className="px-4 py-2">{v.capacity}</td>
                  <td className="px-4 py-2">{v.driverName ?? "—"}</td>
                  <td className="px-4 py-2">{v.assignedStudents}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{v.status}</Badge></td>
                  <td className="px-4 py-2">
                    {v.status === "ACTIVE" ? (
                      <button className="text-xs text-amber-700 hover:underline" disabled={busy === v.id} onClick={() => setStatus(v.id, "MAINTENANCE")}>To maintenance</button>
                    ) : (
                      <button className="text-xs text-primary hover:underline" disabled={busy === v.id} onClick={() => setStatus(v.id, "ACTIVE")}>Activate</button>
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

function RoutesSection({ onChanged }: { onChanged: () => void }) {
  const routes = useApi<{ routes: TransportRoute[] }>("/admin/transport/routes");
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  void onChanged;

  function openRoute(id: string) {
    setSelectedRoute(id);
  }

  if (routes.error) return <ErrorState message={routes.error} onRetry={routes.reload} />;
  if (routes.loading) return <LoadingState label="Loading routes..." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Routes ({routes.data?.routes.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(routes.data?.routes ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => openRoute(r.id)}
              className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedRoute === r.id ? "border-primary" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{r.routeCode} · {r.name}</p>
                <Badge variant="outline">{r.active ? "ACTIVE" : "INACTIVE"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{r.stopCount} stops · {r.assignedStudents} riders{r.vehicleNumber ? ` · ${r.vehicleNumber}` : ""}</p>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stops</CardTitle></CardHeader>
        <CardContent>
          {!selectedRoute ? (
            <p className="text-sm text-muted-foreground">Select a route to see its stops.</p>
          ) : (
            <RouteStops routeId={selectedRoute} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RouteStops({ routeId }: { routeId: string }) {
  const { data, loading, error, reload } = useApi<{ stops: TransportStop[] }>(`/admin/transport/routes/${routeId}`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading stops..." />;
  const stops = data?.stops ?? [];
  return (
    <ol className="space-y-2">
      {stops.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <span className="font-medium">{s.sequence}. {s.name}</span>
          <span className="text-muted-foreground">{formatTime(s.scheduledTime)}</span>
        </li>
      ))}
      {stops.length === 0 && <p className="text-sm text-muted-foreground">No stops on this route yet.</p>}
    </ol>
  );
}

function AssignmentsSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ assignments: TransportAssignment[] }>("/admin/transport/assignments?status=ACTIVE");
  const [busy, setBusy] = useState<string | null>(null);
  void onChanged;
  async function end(id: string) {
    setBusy(id);
    try {
      await api(`/admin/transport/assignments/${id}/end`, { method: "PATCH" });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading assignments..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Active assignments ({data?.assignments.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Route</th>
                <th className="px-4 py-2 font-medium">Stop</th>
                <th className="px-4 py-2 font-medium">Vehicle</th>
                <th className="px-4 py-2 font-medium">Pass</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.assignments ?? []).map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-2">{a.studentName} <span className="text-xs text-gray-500">({a.studentNo})</span></td>
                  <td className="px-4 py-2">{a.routeCode}</td>
                  <td className="px-4 py-2">{a.stopName} · {a.scheduledTime}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.vehicleNumber ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.passNumber ?? "—"}</td>
                  <td className="px-4 py-2">
                    <button className="text-xs text-red-600 hover:underline" disabled={busy === a.id} onClick={() => end(a.id)}>End</button>
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

function AlertsSection({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<{ alerts: TransportAlert[] }>("/admin/transport/alerts");
  const [busy, setBusy] = useState<string | null>(null);
  void onChanged;
  async function deactivate(id: string) {
    setBusy(id);
    try {
      await api(`/admin/transport/alerts/${id}`, { method: "PATCH", body: { active: false } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading alerts..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Alerts ({data?.alerts.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(data?.alerts.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No alerts.</p>}
        {(data?.alerts ?? []).map((al) => (
          <div key={al.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">{al.title} <span className="text-xs text-gray-500">({al.routeCode} · {al.severity})</span></p>
              {al.detail && <p className="text-xs text-muted-foreground">{al.detail}</p>}
            </div>
            {al.active ? (
              <button className="text-xs text-muted-foreground hover:underline" disabled={busy === al.id} onClick={() => deactivate(al.id)}>Deactivate</button>
            ) : (
              <Badge variant="outline">INACTIVE</Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TrackingSection() {
  const { data, loading, error, reload } = useApi<{ tracking: VehicleTracking[]; simulated: boolean }>("/admin/transport/tracking");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading fleet tracking..." />;

  const track = data?.tracking ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Demo tracking from staff input/simulation — not live GPS. Refresh to see updates.
        </p>
        <Badge variant="secondary">Demo data</Badge>
        {data?.simulated && <Badge variant="outline">All simulated</Badge>}
        <Button variant="outline" size="sm" onClick={reload}>
          Refresh
        </Button>
      </div>
      {track.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No vehicles in fleet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {track.map((t) => (
            <Card key={t.vehicleId}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm">{t.registrationNumber}</CardTitle>
                <Badge variant="outline" className={trackingStatusColor(t.trackingStatus)}>
                  {trackingStatusLabel(t.trackingStatus)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {t.route && (
                  <>
                    <p className="text-muted-foreground">{t.route.routeCode} · {t.route.name}</p>
                    {t.currentStop && <p><span className="font-medium">At:</span> {t.currentStop.name} (#{t.currentStop.sequence})</p>}
                    {t.nextStop && <p><span className="font-medium">Next:</span> {t.nextStop.name} (sched. {formatTime(t.nextStop.scheduledTime)})</p>}
                    {t.progressPct != null && (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Route progress</span>
                          <span>{t.progressPct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${t.progressPct}%` }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {t.latitude != null && t.longitude != null && <span>{t.latitude.toFixed(4)}, {t.longitude.toFixed(4)}</span>}
                  {t.speedKmh != null && <span>{t.speedKmh} km/h</span>}
                  {t.lastUpdateAt && <span>{new Date(t.lastUpdateAt).toLocaleString()}</span>}
                </div>
                {t.simulated && <p className="text-xs text-muted-foreground">Demo data (simulated)</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TransportDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: "vehicle" | "driver" | "route" | "stop" | "assign" | "alert";
  onClose: () => void;
  onSaved: () => void;
}) {
  const routes = useApi<{ routes: TransportRoute[] }>(kind === "stop" || kind === "assign" || kind === "alert" ? "/admin/transport/routes" : null);
  const vehicles = useApi<{ vehicles: TransportVehicle[] }>(kind === "assign" ? "/admin/transport/vehicles?status=ACTIVE" : null);
  const [routeId, setRouteId] = useState("");
  const stops = useApi<{ stops: TransportStop[] }>(kind === "assign" && routeId ? `/admin/transport/routes/${routeId}` : null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const titles: Record<string, string> = {
    vehicle: "New vehicle",
    driver: "New driver",
    route: "New route",
    stop: "New stop",
    assign: "Assign student",
    alert: "New route alert",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "vehicle") {
        await api("/admin/transport/vehicles", {
          method: "POST",
          body: { registrationNumber: form.registrationNumber, vehicleType: form.vehicleType || "BUS", capacity: Number(form.capacity) },
        });
      } else if (kind === "driver") {
        await api("/admin/transport/drivers", { method: "POST", body: { name: form.name, phone: form.phone, licenseNo: form.licenseNo } });
      } else if (kind === "route") {
        await api("/admin/transport/routes", { method: "POST", body: { routeCode: form.routeCode, name: form.name } });
      } else if (kind === "stop") {
        await api("/admin/transport/stops", {
          method: "POST",
          body: { routeId: form.routeId, name: form.name, sequence: Number(form.sequence), scheduledTime: form.scheduledTime },
        });
      } else if (kind === "assign") {
        await api("/admin/transport/assignments", {
          method: "POST",
          body: { studentNo: form.studentNo, routeId, stopId: form.stopId, vehicleId: form.vehicleId || null },
        });
      } else {
        await api("/admin/transport/alerts", {
          method: "POST",
          body: { routeId: form.routeId, title: form.title, detail: form.detail || "", severity: form.severity || "INFO" },
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
        <CardHeader><CardTitle>{titles[kind]}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "vehicle" && (
              <>
                <Field label="Registration number" value={form.registrationNumber ?? ""} onChange={set("registrationNumber")} required placeholder="KA-01-XY-0000" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Type</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.vehicleType ?? "BUS"} onChange={set("vehicleType")}>
                      <option value="BUS">Bus</option>
                      <option value="MINIBUS">Minibus</option>
                      <option value="VAN">Van</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Capacity</label>
                    <input type="number" min={1} max={80} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.capacity ?? ""} onChange={set("capacity")} required />
                  </div>
                </div>
              </>
            )}
            {kind === "driver" && (
              <>
                <Field label="Name" value={form.name ?? ""} onChange={set("name")} required />
                <Field label="Phone" value={form.phone ?? ""} onChange={set("phone")} required />
                <Field label="License number" value={form.licenseNo ?? ""} onChange={set("licenseNo")} required />
              </>
            )}
            {kind === "route" && (
              <>
                <Field label="Route code" value={form.routeCode ?? ""} onChange={set("routeCode")} required placeholder="R3-EAST" />
                <Field label="Name" value={form.name ?? ""} onChange={set("name")} required />
              </>
            )}
            {kind === "stop" && (
              <>
                <div>
                  <label className="text-sm font-medium">Route</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.routeId ?? ""} onChange={set("routeId")} required>
                    <option value="">Select route</option>
                    {(routes.data?.routes ?? []).map((r) => (
                      <option key={r.id} value={r.id}>{r.routeCode} · {r.name}</option>
                    ))}
                  </select>
                </div>
                <Field label="Stop name" value={form.name ?? ""} onChange={set("name")} required />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Sequence</label>
                    <input type="number" min={1} max={100} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.sequence ?? ""} onChange={set("sequence")} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Scheduled time</label>
                    <input type="time" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.scheduledTime ?? ""} onChange={set("scheduledTime")} required />
                  </div>
                </div>
              </>
            )}
            {kind === "assign" && (
              <>
                <Field label="Student number" value={form.studentNo ?? ""} onChange={set("studentNo")} required placeholder="SC2025-001" />
                <div>
                  <label className="text-sm font-medium">Route</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={routeId} onChange={(e) => setRouteId(e.target.value)} required>
                    <option value="">Select route</option>
                    {(routes.data?.routes ?? []).filter((r) => r.active).map((r) => (
                      <option key={r.id} value={r.id}>{r.routeCode} · {r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Stop</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.stopId ?? ""} onChange={set("stopId")} required disabled={!routeId}>
                      <option value="">Select stop</option>
                      {(stops.data?.stops ?? []).filter((s) => s.active).map((s) => (
                        <option key={s.id} value={s.id}>{s.sequence}. {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Vehicle (optional)</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.vehicleId ?? ""} onChange={set("vehicleId")}>
                      <option value="">None</option>
                      {(vehicles.data?.vehicles ?? []).map((v) => (
                        <option key={v.id} value={v.id}>{v.registrationNumber}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
            {kind === "alert" && (
              <>
                <div>
                  <label className="text-sm font-medium">Route</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.routeId ?? ""} onChange={set("routeId")} required>
                    <option value="">Select route</option>
                    {(routes.data?.routes ?? []).map((r) => (
                      <option key={r.id} value={r.id}>{r.routeCode} · {r.name}</option>
                    ))}
                  </select>
                </div>
                <Field label="Title" value={form.title ?? ""} onChange={set("title")} required />
                <div>
                  <label className="text-sm font-medium">Detail</label>
                  <textarea
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                    rows={3}
                    value={form.detail ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                    maxLength={2000}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Severity</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.severity ?? "INFO"} onChange={set("severity")}>
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
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

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
