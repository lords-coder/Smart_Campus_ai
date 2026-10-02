"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { AlumniCampaigns } from "@/components/alumni/alumni-campaigns";

export default function AlumniCampaignsPage() {
  return (
    <RoleGuard roles={["STUDENT", "ALUMNI"]}>
      <PageContainer
        title="Giving"
        description="Support university campaigns — pledges are intentions, not payments"
      >
        <AlumniCampaigns />
      </PageContainer>
    </RoleGuard>
  );
}
