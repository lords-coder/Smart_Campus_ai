"use client";

import { ShieldCheck } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { RiskDashboard } from "@/components/risk/risk-dashboard";

function AdminRiskContent() {
  return (
    <PageContainer
      title="Cohort Risk Overview"
      description="Institute-wide early-warning indicators with intervention tracking"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Cohort view of risk levels, declining trends and intervention status. Scores are internal
          early-warning indicators (0–100), not probabilities. Access is limited to authorized staff.
        </p>
      </div>
      <RiskDashboard basePath="/admin/risk" />
    </PageContainer>
  );
}

export default function AdminRiskPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminRiskContent />
    </RoleGuard>
  );
}
