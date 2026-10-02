"use client";

import { RecommendationCard } from "./recommendation-card";
import type { Recommendation } from "@/lib/types";

interface RecommendationListProps {
  recommendations: Recommendation[];
  filter?: string;
}

export function RecommendationList({ recommendations, filter }: RecommendationListProps) {
  // Client-side filtering
  const filtered = recommendations.filter((rec) => {
    if (!filter || filter === "all") return true;
    if (filter === "high" || filter === "medium" || filter === "low") {
      return rec.priority.toLowerCase() === filter;
    }
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          {filter && filter !== "all"
            ? `No ${filter} priority recommendations found.`
            : "No recommendations at this time."}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          Keep up the good work!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((rec) => (
        <RecommendationCard key={rec.courseId} recommendation={rec} />
      ))}
    </div>
  );
}