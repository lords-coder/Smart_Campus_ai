"use client";

import { GraduationCap } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { AlumniManagement } from "@/components/admin/alumni-management";
import { Badge } from "@/components/ui/badge";

function AdminAlumniContent() {
  return (
    <PageContainer
      title="Alumni Management"
      description="Verification, mentorship, events, campaigns and engagement"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Only verified alumni with public profiles appear in the directory.
          Contributions marked RECORDED are office-confirmed; PLEDGED entries are intentions.
        </p>
      </div>
      <AlumniManagement />
    </PageContainer>
  );
}

export default function AdminAlumniPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminAlumniContent />
    </RoleGuard>
  );
}
