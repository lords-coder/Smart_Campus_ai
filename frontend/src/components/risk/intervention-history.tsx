"use client";

import { Card, CardContent } from "@/components/ui/card";
import { InterventionStatusBadge } from "./intervention-status-badge";
import type { Intervention } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  ACADEMIC_REVIEW: "Academic review",
  ATTENDANCE_SUPPORT: "Attendance support",
  ASSESSMENT_SUPPORT: "Assessment support",
  ASSIGNMENT_SUPPORT: "Assignment support",
  REMEDIAL_SUPPORT: "Remedial support",
  FACULTY_MEETING: "Faculty meeting",
  GENERAL_FOLLOW_UP: "General follow-up",
};

export function InterventionHistory({ interventions }: { interventions: Intervention[] }) {
  if (interventions.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg">
        <p className="text-gray-500">No interventions recorded yet.</p>
        <p className="text-sm text-gray-400 mt-1">Create one to start tracking support for this student.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {interventions.map((iv) => (
        <Card key={iv.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-sm">{TYPE_LABELS[iv.intervention_type] ?? iv.intervention_type}</p>
              <InterventionStatusBadge status={iv.status} />
            </div>
            {iv.notes && <p className="text-sm text-gray-700">{iv.notes}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>By {iv.created_by_name ?? "staff"}</span>
              <span>{new Date(iv.created_at).toLocaleDateString()}</span>
              {iv.follow_up_date && <span>Follow-up: {iv.follow_up_date.slice(0, 10)}</span>}
              <span>Risk at creation: {iv.risk_level_at_creation}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
