"use client";

import { LibraryBig } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { LibraryManagement } from "@/components/admin/library-management";
import { Badge } from "@/components/ui/badge";

function AdminLibraryContent() {
  return (
    <PageContainer
      title="Library Management"
      description="Catalogue, circulation, reservations, overdue loans and fines"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <LibraryBig className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Issue and return run inside database transactions with row locks — the same
          copy can never be issued twice, and returns settle fines into the fee ledger.
        </p>
      </div>
      <LibraryManagement />
    </PageContainer>
  );
}

export default function AdminLibraryPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminLibraryContent />
    </RoleGuard>
  );
}
