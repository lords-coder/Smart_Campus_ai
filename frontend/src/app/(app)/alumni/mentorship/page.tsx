"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { MentorshipArea } from "@/components/alumni/mentorship";

export default function MentorshipPage() {
  return (
    <RoleGuard roles={["STUDENT", "ALUMNI"]}>
      <PageContainer
        title="Mentorship"
        description="Learn from graduates — request guidance, track progress"
      >
        <MentorshipArea />
      </PageContainer>
    </RoleGuard>
  );
}
