"use client";

import { Bus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { formatTime } from "@/lib/format";
import type { MyTransport } from "@/lib/types";
import { TrackingCard } from "./tracking-card";

const SEVERITY_STYLES: Record<string, string> = {
  INFO: "border-sky-200 bg-sky-50",
  WARNING: "border-amber-200 bg-amber-50",
  CRITICAL: "border-red-200 bg-red-50",
};

export function StudentTransport() {
  const { data, loading, error, reload } = useApi<MyTransport>("/transport/me");

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading transport details..." />;
  if (!data?.assignment) {
    return (
      <EmptyState
        title="No transport assigned"
        description="You are currently not assigned to any bus route. Contact the transport office for a route assignment and bus pass."
        icon={<Bus className="h-6 w-6" />}
      />
    );
  }

  const a = data.assignment;
  return (
    <div className="space-y-6">
      {data.tracking && <TrackingCard tracking={data.tracking} />}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div key={i} className={`rounded-lg border p-3 ${SEVERITY_STYLES[alert.severity] ?? ""}`}>
              <p className="text-sm font-medium">{alert.title}</p>
              {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.route.routeCode} · {a.route.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Pickup stop:</span> {a.stop.name} at {formatTime(a.stop.scheduledTime)}</p>
            <p>
              <span className="text-muted-foreground">Vehicle:</span>{" "}
              {a.vehicle ? `${a.vehicle.registrationNumber} (${a.vehicle.vehicleType})` : "Not assigned yet"}
            </p>
            {a.vehicle?.driverName && (
              <p><span className="text-muted-foreground">Driver:</span> {a.vehicle.driverName}</p>
            )}
            <p><span className="text-muted-foreground">Since:</span> {a.startDate}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bus pass</CardTitle>
          </CardHeader>
          <CardContent>
            {data.pass ? (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-mono font-semibold">{data.pass.passNumber}</p>
                <p><span className="text-muted-foreground">Valid:</span> {data.pass.validFrom} → {data.pass.validUntil}</p>
                <p className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline">{data.pass.status}</Badge>
                </p>
                {data.pass.transportFeeStatus && (
                  <p><span className="text-muted-foreground">Transport fee:</span> {data.pass.transportFeeStatus}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No bus pass issued yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Route stops</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {a.allStops.map((stop) => (
              <li
                key={stop.sequence}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                  stop.name === a.stop.name ? "border-primary bg-accent/40" : ""
                }`}
              >
                <span className="font-medium">{stop.sequence}. {stop.name}</span>
                <span className="text-muted-foreground">{formatTime(stop.scheduledTime)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
