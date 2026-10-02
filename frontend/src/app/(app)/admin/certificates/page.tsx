"use client";

import { FileBadge } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { CertificateManagement } from "@/components/admin/certificate-management";
import { Badge } from "@/components/ui/badge";

function AdminCertificatesContent() {
  return (
    <PageContainer
      title="Certificate Management"
      description="Review requests, approve, issue, and revoke certificates"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <FileBadge className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Approvals and issuance run inside database transactions — a certificate number
          and verification code are generated exactly once per approved request.
        </p>
      </div>
      <CertificateManagement />
    </PageContainer>
  );
}

export default function AdminCertificatesPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminCertificatesContent />
    </RoleGuard>
  );
}
