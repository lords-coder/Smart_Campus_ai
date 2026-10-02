"use client";

import { Users } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { ParentDashboard } from "@/components/parent/parent-dashboard";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";

function ParentContent() {
  const { user } = useAuth();
  return (
    <PageContainer
      title={`Welcome, ${user?.name.split(" ")[0] ?? "parent"}`}
      description="Your child's academic overview — attendance, fees, classes and learning focus"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>PARENT</Badge>
          <Badge variant="outline">{user?.name}</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This portal shows read-only academic information for students linked to your account.
          For payments or record corrections, please contact the institute office.
        </p>
      </div>
      <ParentDashboard />
    </PageContainer>
  );
}

export default function ParentPage() {
  return (
    <RoleGuard roles={["PARENT"]}>
      <ParentContent />
    </RoleGuard>
  );
}
