"use client";

import { UtensilsCrossed } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { MessManagement } from "@/components/admin/mess-management";
import { Badge } from "@/components/ui/badge";

function AdminMessContent() {
  return (
    <PageContainer
      title="Mess & Canteen Management"
      description="Plans, menu, meal records, canteen, orders, billing and feedback"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Billing writes ordinary fee-ledger rows and is idempotent — re-running a
          month never duplicates charges.
        </p>
      </div>
      <MessManagement />
    </PageContainer>
  );
}

export default function AdminMessPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminMessContent />
    </RoleGuard>
  );
}
