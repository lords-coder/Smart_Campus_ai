"use client";

import { BedDouble } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { HostelManagement } from "@/components/admin/hostel-management";
import { Badge } from "@/components/ui/badge";

function AdminHostelContent() {
  return (
    <PageContainer
      title="Hostel Management"
      description="Occupancy, rooms, allocations, complaints, room changes and visitors"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <BedDouble className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Allocations and room moves execute inside database transactions with capacity
          enforcement — a bed can never be double-booked and a room can never overfill.
        </p>
      </div>
      <HostelManagement />
    </PageContainer>
  );
}

export default function AdminHostelPage() {
  return (
    <RoleGuard roles={["ADMIN"]}>
      <AdminHostelContent />
    </RoleGuard>
  );
}
