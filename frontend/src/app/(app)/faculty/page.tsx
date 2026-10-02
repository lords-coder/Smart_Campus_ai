"use client";

import { GraduationCap } from "lucide-react";
import { AttendanceManager } from "@/components/attendance/attendance-manager";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import type { FacultyProfile } from "@/lib/types";

function FacultyContent() {
  const { user, profile } = useAuth();
  const facultyProfile = profile as FacultyProfile | null;

  return (
    <PageContainer
      title="Attendance Management"
      description="Select a class, mark your students and submit the session"
      actions={
        <div className="flex flex-wrap gap-2">
          {facultyProfile && <Badge variant="secondary">{facultyProfile.employeeNo}</Badge>}
          <Badge variant="outline">{user?.name}</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Attendance is saved to the database immediately — students see updated percentages as soon as
          you submit. Re-submitting the same class and date updates the existing records.
        </p>
      </div>
      <AttendanceManager />
    </PageContainer>
  );
}

export default function FacultyPage() {
  return (
    <RoleGuard roles={["FACULTY"]}>
      <FacultyContent />
    </RoleGuard>
  );
}
