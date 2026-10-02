"use client";

import { use } from "react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentRiskDetail } from "@/components/risk/student-risk-detail";

export default function FacultyStudentRiskPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return (
    <RoleGuard roles={["FACULTY"]}>
      <PageContainer title="Student Risk Profile" description="Evidence, trends and intervention history">
        <StudentRiskDetail studentId={studentId} backHref="/faculty/risk" />
      </PageContainer>
    </RoleGuard>
  );
}
