"use client";

import { Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyTransport } from "@/lib/types";
import { formatTime, trackingStatusColor, trackingStatusLabel } from "@/lib/format";

type Tracking = NonNullable<MyTransport["tracking"]>;

export function TrackingCard({ tracking }: { tracking: Tracking }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Navigation className="h-4 w-4" />
          Live bus status
          <Badge variant="outline" className={trackingStatusColor(tracking.trackingStatus)}>
            {trackingStatusLabel(tracking.trackingStatus)}
          </Badge>
          <Badge variant="secondary">Demo tracking</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Demo data from staff input/simulation — not live GPS. Positions update when the
          transport office reports them.
        </p>
        {tracking.route && tracking.progressPct != null ? (
          <>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {tracking.currentStop ? `At ${tracking.currentStop.name}` : "En route"}
                </span>
                <span>{tracking.progressPct}% of route</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${tracking.progressPct}%` }}
                />
              </div>
            </div>
            <p>
              <span className="text-muted-foreground">Next stop:</span>{" "}
              {tracking.nextStop
                ? `${tracking.nextStop.name} (sched. ${formatTime(tracking.nextStop.scheduledTime)})`
                : "Terminus — route complete"}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            {tracking.trackingStatus === "OFFLINE"
              ? "No recent position for this bus (offline for 15+ min or not reporting yet)."
              : "Route progress will appear once the bus reports its current stop."}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {tracking.latitude != null && tracking.longitude != null && (
            <span>
              Position: {tracking.latitude.toFixed(4)}, {tracking.longitude.toFixed(4)}
            </span>
          )}
          {tracking.speedKmh != null && <span>Speed: {tracking.speedKmh} km/h</span>}
          {tracking.lastUpdateAt && (
            <span>Updated: {new Date(tracking.lastUpdateAt).toLocaleString()}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
