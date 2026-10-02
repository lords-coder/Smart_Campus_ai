"use client";

import { Award } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentCertificates } from "@/components/certificates/student-certificates";

function CertificatesContent() {
  return (
    <PageContainer
      title="Certificates"
      description="Request official documents, track reviews, and download issued certificates"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Award className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Requests are reviewed by the institute office. Issued certificates carry a unique
          number and a QR code that anyone can verify — no login needed.
        </p>
      </div>
      <StudentCertificates />
    </PageContainer>
  );
}

export default function CertificatesPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <CertificatesContent />
    </RoleGuard>
  );
}
