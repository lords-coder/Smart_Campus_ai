"use client";

import { BedDouble } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentHostel } from "@/components/hostel/student-hostel";

function HostelContent() {
  return (
    <PageContainer
      title="Hostel"
      description="Your room, fees, complaints, requests and visitors"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <BedDouble className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Room allocation is managed by the hostel office — requests made here are reviewed
          by staff before any change takes effect.
        </p>
      </div>
      <StudentHostel />
    </PageContainer>
  );
}

export default function HostelPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <HostelContent />
    </RoleGuard>
  );
}
