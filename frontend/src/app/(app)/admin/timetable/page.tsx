"use client";

import { CalendarDays } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { TimetableManager } from "@/components/admin/timetable-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";

function AdminTimetableContent() {
  const { user } = useAuth();

  return (
    <PageContainer
      title="Timetable Management"
      description="Plan the weekly class schedule, resolve conflicts and retire old slots"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
          <Badge variant="outline">{user?.name}</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Every new or edited slot is checked against faculty, room and section clashes before it is
          saved. Removing a class archives it (attendance history stays intact and it can be restored);
          a permanent delete is only offered while the class has no attendance records.
        </p>
      </div>
      <TimetableManager />
    </PageContainer>
  );
}

export default function AdminTimetablePage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminTimetableContent />
    </RoleGuard>
  );
}
