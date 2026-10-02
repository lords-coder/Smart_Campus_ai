"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowDownRight, ClipboardList, Users } from "lucide-react";
import type { RiskStats } from "@/lib/types";

export function RiskSummary({ stats }: { stats: RiskStats }) {
  const cards = [
    { icon: AlertTriangle, label: "Critical", value: stats.critical, color: "bg-red-100 text-red-600" },
    { icon: Users, label: "High risk", value: stats.high, color: "bg-orange-100 text-orange-600" },
    { icon: ArrowDownRight, label: "Declining attendance", value: stats.decliningAttendance, color: "bg-yellow-100 text-yellow-700" },
    { icon: ClipboardList, label: "Open interventions", value: stats.openInterventions, color: "bg-blue-100 text-blue-600" },
  ];
  return (
    <div id="risk-stats" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="md:col-span-4 text-xs text-muted-foreground">
        Monitoring indicators for authorized review — risk scores are early-warning signals, not predictions of a student&apos;s future.
        Total students in scope: {stats.totalStudents} · Moderate: {stats.moderate} · Low: {stats.low}
      </p>
    </div>
  );
}
