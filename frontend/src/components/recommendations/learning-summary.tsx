"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, Target } from "lucide-react";
import type { RecommendationsSummary } from "@/lib/types";

interface LearningSummaryProps {
  summary: RecommendationsSummary;
}

export function LearningSummary({ summary }: LearningSummaryProps) {
  const cards = [
    {
      icon: AlertTriangle,
      label: "High Priority",
      value: summary.highPriority,
      color: "bg-red-100 text-red-600",
      iconColor: "text-red-600",
    },
    {
      icon: Clock,
      label: "Medium Priority",
      value: summary.mediumPriority,
      color: "bg-yellow-100 text-yellow-600",
      iconColor: "text-yellow-600",
    },
    {
      icon: Target,
      label: "Courses Needing Attention",
      value: summary.coursesNeedingAttention,
      color: "bg-blue-100 text-blue-600",
      iconColor: "text-blue-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}