"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StudentMess } from "@/components/mess/student-mess";
import { StudentCanteen } from "@/components/mess/student-canteen";
import { StudentFeedback } from "@/components/mess/student-feedback";
import { Button } from "@/components/ui/button";

type Tab = "mess" | "canteen" | "feedback";

function MessContent() {
  const [tab, setTab] = useState<Tab>("mess");
  return (
    <PageContainer
      title="Mess & Canteen"
      description="Meal plans, weekly menu, canteen orders and food billing"
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Mess billing and canteen purchases land in your regular fee ledger.
          Orders lock prices at purchase time, so history never changes.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["mess", "canteen", "feedback"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "mess" ? "Mess" : t === "canteen" ? "Canteen" : "Feedback"}
          </Button>
        ))}
      </div>
      {tab === "mess" && <StudentMess />}
      {tab === "canteen" && <StudentCanteen />}
      {tab === "feedback" && <StudentFeedback />}
    </PageContainer>
  );
}

export default function MessPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <MessContent />
    </RoleGuard>
  );
}
