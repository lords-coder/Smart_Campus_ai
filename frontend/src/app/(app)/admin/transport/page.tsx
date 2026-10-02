"use client";

import { Bus } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { TransportManagement } from "@/components/admin/transport-management";
import { Badge } from "@/components/ui/badge";

function AdminTransportContent() {
  return (
    <PageContainer
      title="Transport Management"
      description="Fleet, drivers, routes, assignments, passes and alerts"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Bus className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Vehicle status is managed manually by staff in this release. Assigning a student
          automatically generates their bus pass.
        </p>
      </div>
      <TransportManagement />
    </PageContainer>
  );
}

export default function AdminTransportPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminTransportContent />
    </RoleGuard>
  );
}
