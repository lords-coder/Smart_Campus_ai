import { trackingStatusLabel } from "@/lib/format";
import type { MyTransport } from "@/lib/types";

type Tracking = NonNullable<MyTransport["tracking"]>;

/**
 * Fleet status line for the Command Center.
 *
 * Uses the shared `trackingStatusLabel` so the wording matches the student
 * transport page and the admin fleet view ("Moving" / "Idle" / "Offline") and
 * never leaks the raw MOVING/IDLE/OFFLINE enum.
 */
export function TrackingStatusLine({ tracking }: { tracking: Tracking | null }) {
  if (!tracking) {
    return <p className="connection-state__copy">No live position is available for your bus.</p>;
  }

  return (
    <>
      <p className="connection-state__copy">
        <strong data-tracking-status={tracking.trackingStatus}>
          {trackingStatusLabel(tracking.trackingStatus)}
        </strong>{" "}
        Demo tracking
        {tracking.currentStop ? ` · at ${tracking.currentStop.name}` : ""}
        {tracking.nextStop ? ` · next ${tracking.nextStop.name}` : ""}
      </p>
      <p className="connection-state__copy">
        Progress {tracking.progressPct ?? 0}%
        {tracking.lastUpdateAt ? ` · updated ${new Date(tracking.lastUpdateAt).toLocaleString("en-IN")}` : ""}
      </p>
    </>
  );
}
