"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge } from "./priority-badge";
import { ResourceCard } from "./resource-card";
import type { Recommendation } from "@/lib/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const categoryLabels: Record<string, string> = {
    COURSE_WEAKNESS: "Course Weakness",
    ATTENDANCE: "Attendance",
    ASSESSMENT: "Assessment",
    ASSIGNMENT: "Assignment",
    STUDY_ACTION: "Study Action",
    REMEDIAL_SUPPORT: "Remedial Support",
  };

  const categoryColors: Record<string, string> = {
    COURSE_WEAKNESS: "bg-purple-100 text-purple-700 border-purple-200",
    ATTENDANCE: "bg-blue-100 text-blue-700 border-blue-200",
    ASSESSMENT: "bg-orange-100 text-orange-700 border-orange-200",
    ASSIGNMENT: "bg-indigo-100 text-indigo-700 border-indigo-200",
    STUDY_ACTION: "bg-cyan-100 text-cyan-700 border-cyan-200",
    REMEDIAL_SUPPORT: "bg-rose-100 text-rose-700 border-rose-200",
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: getPriorityBorderColor(recommendation.priority) }}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{recommendation.courseName}</CardTitle>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${categoryColors[recommendation.category] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
              {categoryLabels[recommendation.category] || recommendation.category}
            </span>
            <PriorityBadge priority={recommendation.priority} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700">{recommendation.reason}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500">Attendance</p>
            <p className="font-medium text-gray-900">{recommendation.metrics.attendancePercentage}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Assessments</p>
            <p className="font-medium text-gray-900">{recommendation.metrics.assessmentPercentage}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Assignments</p>
            <p className="font-medium text-gray-900">{recommendation.metrics.assignmentSubmissionRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Assignments</p>
            <p className="font-medium text-gray-900">{recommendation.metrics.totalAssignments}</p>
          </div>
        </div>

        {recommendation.resources.length > 0 && (
          <div>
            <h5 className="font-medium text-sm text-gray-900 mb-2">Recommended Resources</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recommendation.resources.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getPriorityBorderColor(priority: "HIGH" | "MEDIUM" | "LOW"): string {
  switch (priority) {
    case "HIGH":
      return "#ef4444"; // red-500
    case "MEDIUM":
      return "#f59e0b"; // yellow-500
    case "LOW":
      return "#22c55e"; // green-500
  }
}