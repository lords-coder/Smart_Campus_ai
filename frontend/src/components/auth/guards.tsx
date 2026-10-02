"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { LoadingState } from "@/components/states/loading-state";
import { roleHome } from "@/lib/format";
import type { Role } from "@/lib/types";

/**
 * Layout-level guard: resolves the session, then bounces anonymous users to /login.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="auth-surface">
        <LoadingState label="Restoring your session..." />
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div className="auth-surface">
        <LoadingState label="Redirecting to sign in..." />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Page-level role gate. Backend endpoints are independently protected;
 * this only controls what the UI renders.
 */
export function RoleGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const hasAccess = roles.includes(user.role) || (user.role === "SUPER_ADMIN" && roles.includes("ADMIN"));
    if (!hasAccess) {
      router.replace(roleHome(user.role));
    }
  }, [status, user, roles, router]);

  if (!user || !(roles.includes(user.role) || (user.role === "SUPER_ADMIN" && roles.includes("ADMIN")))) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">You do not have access to this page</p>
        <p className="text-sm text-muted-foreground">
          This area is restricted to the {roles.join(" and ")} role.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
