"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { RegistrationRequests } from "@/components/super-admin/registration-requests";
import { PasswordAssistance } from "@/components/super-admin/password-assistance";
import { UserManagement } from "@/components/super-admin/user-management";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "registrations", label: "Registration requests" },
  { id: "password-help", label: "Password assistance" },
  { id: "users", label: "User management" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function SuperAdminContent() {
  const [section, setSection] = useState<SectionId>("registrations");

  return (
    <PageContainer
      title="Super Admin"
      description="Approve registrations, handle account help requests and manage users"
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge>SUPER_ADMIN</Badge>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          New student, faculty and administrator accounts stay inactive until you approve them. Password
          help is handled by issuing a single-use reset link — passwords and hashes are never displayed here.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Super admin sections">
        {SECTIONS.map((item) => (
          <Button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            size="sm"
            variant={section === item.id ? "default" : "outline"}
            className={cn(section === item.id && "shadow-xs")}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {section === "registrations" && <RegistrationRequests />}
      {section === "password-help" && <PasswordAssistance />}
      {section === "users" && <UserManagement />}
    </PageContainer>
  );
}

export default function SuperAdminPage() {
  return (
    <RoleGuard roles={["SUPER_ADMIN"]}>
      <SuperAdminContent />
    </RoleGuard>
  );
}