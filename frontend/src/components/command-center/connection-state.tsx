import type { LucideIcon } from "lucide-react";

/**
 * Inline state panel from the command-center design.
 *
 * Used for genuine "no data source" moments (for example a student with no
 * transport assignment) rather than as a stand-in for unconnected APIs.
 */
type ConnectionStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
};

export function ConnectionState({ icon: Icon, title, description, compact = false }: ConnectionStateProps) {
  return (
    <div className={`connection-state${compact ? " connection-state--compact" : ""}`}>
      <span className="connection-state__icon">
        <Icon size={compact ? 17 : 19} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="connection-state__copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
