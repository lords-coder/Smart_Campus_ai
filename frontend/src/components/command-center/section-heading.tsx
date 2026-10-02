import type { ReactNode } from "react";

/** Section header from the command-center design. */
type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
};

export function SectionHeading({ eyebrow, title, detail, action }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div className="section-heading__copy">
        {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {detail && <p className="section-heading__detail">{detail}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  );
}
