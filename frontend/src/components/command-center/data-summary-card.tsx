import type { LucideIcon } from "lucide-react";

/**
 * Summary card from the command-center design.
 *
 * The prototype hard-coded a "Not connected" badge and an em dash because it
 * had no data source. Here `value` is real API output and `status` reflects the
 * live state, so the card reports what actually happened.
 */
type DataSummaryCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: "aqua" | "blue" | "violet";
  /** Headline figure from the API, e.g. "97.8%". */
  value: string;
  /** Short state label rendered in the badge. */
  status: string;
  /** Marks a degraded read (error, or an explicitly unavailable source). */
  degraded?: boolean;
  href?: string;
};

export function DataSummaryCard({
  title,
  description,
  icon: Icon,
  accent = "aqua",
  value,
  status,
  degraded = false,
}: DataSummaryCardProps) {
  return (
    <article className={`summary-card summary-card--${accent}`}>
      <div className="summary-card__head">
        <span className="summary-card__icon">
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="connection-badge" data-state={degraded ? "degraded" : "live"}>
          <span aria-hidden="true" />
          {status}
        </span>
      </div>
      <h3>{title}</h3>
      <div
        className="summary-card__value"
        data-degraded={degraded ? "true" : undefined}
        title={degraded ? `${title} is currently degraded` : undefined}
      >
        {value}
      </div>
      <p className="summary-card__description">{description}</p>
      <div className="summary-card__rule" aria-hidden="true" />
    </article>
  );
}
