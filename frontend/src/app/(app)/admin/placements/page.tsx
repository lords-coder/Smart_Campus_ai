"use client";

import { Briefcase } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { PlacementManagement } from "@/components/admin/placement-management";
import { Badge } from "@/components/ui/badge";

function AdminPlacementsContent() {
  return (
    <PageContainer
      title="Placement Management"
      description="Companies, drives, applications, interviews, offers and analytics"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Briefcase className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Application states move only through explicit staff actions, and offers are
          created atomically on selected applications.
        </p>
      </div>
      <PlacementManagement />
    </PageContainer>
  );
}

export default function AdminPlacementsPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminPlacementsContent />
    </RoleGuard>
  );
}
