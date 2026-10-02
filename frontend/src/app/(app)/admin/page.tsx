"use client";

import { ShieldCheck } from "lucide-react";
import { FeeManagement } from "@/components/admin/fee-management";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";

function AdminContent() {
  const { user } = useAuth();

  return (
    <PageContainer
      title="Fee Management"
      description="Search student fee records, record payments and review payment history"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
          <Badge variant="outline">{user?.name}</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Payments recorded here are verified offline receipts — no payment gateway is involved.
          Fee status (PENDING / PARTIAL / PAID) is recalculated by the backend on every payment.
        </p>
      </div>
      <FeeManagement />
    </PageContainer>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminContent />
    </RoleGuard>
  );
}
