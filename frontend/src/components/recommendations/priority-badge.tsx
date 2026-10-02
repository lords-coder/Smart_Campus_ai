"use client";

import { Badge } from "@/components/ui/badge";

interface PriorityBadgeProps {
  priority: "HIGH" | "MEDIUM" | "LOW";
}

const PRIORITY_STYLES: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge variant="outline" className={PRIORITY_STYLES[priority]}>
      {priority}
    </Badge>
  );
}