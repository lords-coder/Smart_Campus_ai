"use client";

import { LibraryBig } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentLibrary } from "@/components/library/student-library";

function LibraryContent() {
  return (
    <PageContainer
      title="Library"
      description="Search the catalogue, track loans and fines, manage reservations"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <LibraryBig className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Issuance happens at the library desk. Renew online while no other student is
          waiting; overdue returns accrue a fine of Rs.10 per day (capped at Rs.500).
        </p>
      </div>
      <StudentLibrary />
    </PageContainer>
  );
}

export default function LibraryPage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY"]}>
      <LibraryContent />
    </RoleGuard>
  );
}
