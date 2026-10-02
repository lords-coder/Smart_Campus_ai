"use client";

import { Bus } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentTransport } from "@/components/transport/student-transport";

function TransportContent() {
  return (
    <PageContainer
      title="Transport"
      description="Your bus route, pickup stop, pass and route alerts"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Bus className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Route assignments and bus passes are managed by the transport office. The live
          bus status below is demo tracking from staff-reported positions, not live GPS.
        </p>
      </div>
      <StudentTransport />
    </PageContainer>
  );
}

export default function TransportPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <TransportContent />
    </RoleGuard>
  );
}
