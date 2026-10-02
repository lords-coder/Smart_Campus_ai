"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { RiskLevelBadge } from "./risk-level-badge";
import { TrendCard } from "./trend-card";
import { InterventionHistory } from "./intervention-history";
import { InterventionDialog } from "./intervention-dialog";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Intervention, RiskDetail } from "@/lib/types";

interface StudentRiskDetailProps {
  studentId: string;
  backHref: string;
}

export function StudentRiskDetail({ studentId, backHref }: StudentRiskDetailProps) {
  const { data, loading, error, reload } = useApi<RiskDetail>(`/risk/students/${studentId}`);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Intervention | null>(null);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading student risk profile..." />;
  if (!data) return <ErrorState message="No data available" onRetry={reload} />;

  const { student, riskAnalysis, interventions } = data;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm text-primary hover:underline">
        ← Back to risk dashboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{student.student_name}</h1>
          <p className="text-gray-500 text-sm">
            {student.student_no} · Section {student.section} · Semester {student.semester}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskLevelBadge level={riskAnalysis.riskLevel} />
          <span className="text-sm text-gray-600">Score: {riskAnalysis.riskScore}/100 (internal indicator)</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence — review recommended</CardTitle>
        </CardHeader>
        <CardContent>
          {riskAnalysis.signals.length === 0 ? (
            <p className="text-sm text-gray-600">No warning signals. Academic indicators appear stable.</p>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {riskAnalysis.signals.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TrendCard title="Attendance trend" trend={riskAnalysis.trends.attendance} />
        <TrendCard title="Assessment trend" trend={riskAnalysis.trends.assessments} />
        <TrendCard title="Assignment trend" trend={riskAnalysis.trends.assignments} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div><p className="text-gray-500">Attendance</p><p className="font-medium">{riskAnalysis.currentMetrics.attendancePercentage}%</p></div>
          <div><p className="text-gray-500">Assessments</p><p className="font-medium">{riskAnalysis.currentMetrics.avgAssessmentPercentage}%</p></div>
          <div><p className="text-gray-500">Assignments</p><p className="font-medium">{riskAnalysis.currentMetrics.assignmentSubmissionRate}%</p></div>
          <div><p className="text-gray-500">Assignment score</p><p className="font-medium">{riskAnalysis.currentMetrics.avgAssignmentScore}%</p></div>
          <div><p className="text-gray-500">Academic score</p><p className="font-medium">{riskAnalysis.currentMetrics.academicScore}</p></div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Interventions ({interventions.length})</h2>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          Create intervention
        </Button>
      </div>
      <InterventionHistory interventions={interventions} />
      <div className="flex flex-wrap gap-2">
        {interventions.filter((iv) => iv.status === "OPEN" || iv.status === "IN_PROGRESS").map((iv) => (
          <Button key={iv.id} size="sm" variant="outline" onClick={() => { setEditing(iv); setDialogOpen(true); }}>
            Update: {(iv.intervention_type ?? "").replace(/_/g, " ").toLowerCase()}
          </Button>
        ))}
      </div>

      {dialogOpen && (
        <InterventionDialog
          studentId={studentId}
          baseApiPath="/risk"
          editing={editing}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          onSaved={reload}
        />
      )}
    </div>
  );
}
