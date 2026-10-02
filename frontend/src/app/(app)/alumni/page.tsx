"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { AlumniDirectory } from "@/components/alumni/alumni-directory";

function AlumniContent() {
  return (
    <PageContainer
      title="Alumni Directory"
      description="Verified graduates sharing their professional journeys"
      actions={
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/alumni/mentorship" className="font-medium text-primary hover:underline">
            Mentorship
          </Link>
          <Link href="/alumni/events" className="font-medium text-primary hover:underline">
            Events
          </Link>
          <Link href="/alumni/campaigns" className="font-medium text-primary hover:underline">
            Giving
          </Link>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Only verified alumni with public profiles are listed here. Contact details
          are never shown — mentorship requests go through the portal.
        </p>
      </div>
      <AlumniDirectory />
    </PageContainer>
  );
}

export default function AlumniPage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY", "ALUMNI"]}>
      <AlumniContent />
    </RoleGuard>
  );
}
