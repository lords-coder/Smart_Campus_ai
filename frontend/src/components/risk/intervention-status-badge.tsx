"use client";

import { Badge } from "@/components/ui/badge";
import type { InterventionStatus } from "@/lib/types";

const STYLES: Record<InterventionStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800 border-blue-300",
  IN_PROGRESS: "bg-purple-100 text-purple-800 border-purple-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
  DISMISSED: "bg-gray-100 text-gray-600 border-gray-300",
};

const LABELS: Record<InterventionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DISMISSED: "Dismissed",
};

export function InterventionStatusBadge({ status }: { status: InterventionStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
