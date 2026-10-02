"use client";

import { Users } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { ParentManagement } from "@/components/admin/parent-management";
import { Badge } from "@/components/ui/badge";

function AdminParentsContent() {
  return (
    <PageContainer
      title="Parent Management"
      description="Parent accounts, student links and invitations"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Invitations are single-use and expire after 7 days. The full invitation link is shown
          once at creation — share it with the parent through a trusted channel. No email is sent.
        </p>
      </div>
      <ParentManagement />
    </PageContainer>
  );
}

export default function AdminParentsPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminParentsContent />
    </RoleGuard>
  );
}
