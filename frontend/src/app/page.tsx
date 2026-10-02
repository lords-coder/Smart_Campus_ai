"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { LoadingState } from "@/components/states/loading-state";
import { roleHome } from "@/lib/format";

export default function HomePage() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(roleHome(user.role));
    } else if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, user, router]);

  return (
    <div className="auth-surface">
      <LoadingState label="Loading SmartCampus AI..." />
    </div>
  );
}
