"use client";

import { use } from "react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentRiskDetail } from "@/components/risk/student-risk-detail";

export default function AdminStudentRiskPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return (
    <RoleGuard roles={["ADMIN"]}>
      <PageContainer title="Student Risk Profile" description="Evidence, trends and intervention history">
        <StudentRiskDetail studentId={studentId} backHref="/admin/risk" />
      </PageContainer>
    </RoleGuard>
  );
}
