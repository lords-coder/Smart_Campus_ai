"use client";

import { CalendarDays } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { FacultyTimetable } from "@/components/faculty/timetable-view";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import type { FacultyProfile } from "@/lib/types";

function FacultyTimetableContent() {
  const { user, profile } = useAuth();
  const facultyProfile = profile as FacultyProfile | null;

  return (
    <PageContainer
      title="My Timetable"
      description="Your assigned classes for the week"
      actions={
        <div className="flex flex-wrap gap-2">
          {facultyProfile && <Badge variant="secondary">{facultyProfile.employeeNo}</Badge>}
          <Badge variant="outline">{user?.name}</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The timetable is maintained by the admin office. If a slot looks wrong, ask an administrator
          to update it — your attendance classes refresh here automatically.
        </p>
      </div>
      <FacultyTimetable />
    </PageContainer>
  );
}

export default function FacultyTimetablePage() {
  return (
    <RoleGuard roles={["FACULTY"]}>
      <FacultyTimetableContent />
    </RoleGuard>
  );
}
