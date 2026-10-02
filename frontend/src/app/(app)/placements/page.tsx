"use client";

import { Briefcase } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentPlacements } from "@/components/placements/student-placements";

function PlacementsContent() {
  return (
    <PageContainer
      title="Placements"
      description="Open drives, eligibility, applications and placement history"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Briefcase className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Eligibility is computed from live academic records — attendance, assessment
          averages, department, semester, and graduating batch. Shortlisting and
          selection are decided by placement staff, never automatically.
        </p>
      </div>
      <StudentPlacements />
    </PageContainer>
  );
}

export default function PlacementsPage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY"]}>
      <PlacementsContent />
    </RoleGuard>
  );
}
