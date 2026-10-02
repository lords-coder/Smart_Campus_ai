"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { AlumniEvents } from "@/components/alumni/alumni-events";

export default function AlumniEventsPage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY", "ALUMNI"]}>
      <PageContainer
        title="Alumni Events"
        description="Meets, career talks, reunions and networking"
      >
        <AlumniEvents />
      </PageContainer>
    </RoleGuard>
  );
}
