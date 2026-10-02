"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { AlumniProfileForm } from "@/components/alumni/alumni-profile-form";

export default function AlumniProfilePage() {
  return (
    <RoleGuard roles={["ALUMNI"]}>
      <PageContainer
        title="My Alumni Profile"
        description="Keep your professional story current"
      >
        <AlumniProfileForm />
      </PageContainer>
    </RoleGuard>
  );
}
