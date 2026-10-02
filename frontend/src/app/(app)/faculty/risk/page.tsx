"use client";

import { HeartHandshake } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { RiskDashboard } from "@/components/risk/risk-dashboard";

function FacultyRiskContent() {
  return (
    <PageContainer
      title="Student Risk Indicators"
      description="Early-warning academic signals for your classes — review recommended, not disciplinary"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Risk levels are advisory signals computed from attendance, assessment and assignment trends
          in your assigned courses. They support human review and timely support — they never trigger
          automatic action against a student.
        </p>
      </div>
      <RiskDashboard basePath="/faculty/risk" />
    </PageContainer>
  );
}

export default function FacultyRiskPage() {
  return (
    <RoleGuard roles={["FACULTY"]}>
      <FacultyRiskContent />
    </RoleGuard>
  );
}
