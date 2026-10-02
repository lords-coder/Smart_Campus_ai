"use client";

import Link from "next/link";
import { RoleGuard } from "@/components/auth/guards";
import { CommandCenter } from "@/components/command-center/command-center";
import { STUDENT_QUICK_ACTIONS } from "@/components/dashboard/quick-actions";

/**
 * Student landing page.
 *
 * The surface and its content come from the command-center design integrated at
 * `src/components/command-center`; quick actions are retained from the original
 * dashboard so no existing capability is lost in the swap.
 */
function DashboardContent() {
  return (
    <div className="command-center-surface">
      <CommandCenter />
      <section className="quick-actions" aria-labelledby="quick-actions-title">        <h2 id="quick-actions-title" className="section-heading__copy">
          Quick actions
        </h2>
        <div className="quick-actions__grid">
          {STUDENT_QUICK_ACTIONS.map((action) => (
            <Link key={action.href} className="quick-action" href={action.href}>
              <span className="quick-action__icon">{action.icon}</span>
              <span className="quick-action__body">
                <strong>{action.title}</strong>
                <small>{action.description}</small>
              </span>
              {action.cta && <span className="quick-action__cta">{action.cta}</span>}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <DashboardContent />
    </RoleGuard>
  );
}
