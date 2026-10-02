"use client";

import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/lib/types";

const STYLES: Record<RiskLevel, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MODERATE: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export function RiskLevelBadge({ level }: { level: RiskLevel | null | undefined }) {
  if (!level) {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
        NO DATA
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={STYLES[level]}>
      {level}
    </Badge>
  );
}
