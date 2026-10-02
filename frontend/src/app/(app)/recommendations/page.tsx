"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { RoleGuard } from "@/components/auth/guards";
import { LearningSummary } from "@/components/recommendations/learning-summary";
import { RecommendationList } from "@/components/recommendations/recommendation-list";
import { RecommendationFilters } from "@/components/recommendations/recommendation-filters";
import type { RecommendationsResponse } from "@/lib/types";

export default function RecommendationsPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <RecommendationsContent />
    </RoleGuard>
  );
}

function RecommendationsContent() {
  const [activeFilter, setActiveFilter] = useState("all");
  const { data, loading, error, reload } = useApi<RecommendationsResponse>("/recommendations");

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-2">Failed to load recommendations</p>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button onClick={reload} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Try Again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const { summary, recommendations } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personalized Learning Plan</h1>
          <p className="text-gray-500 mt-1">
            Data-driven recommendations based on your academic performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Demo resources - not official university materials</span>
        </div>
      </div>

      <LearningSummary summary={summary} />

      <RecommendationFilters
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <RecommendationList
        recommendations={recommendations}
        filter={activeFilter}
      />
    </div>
  );
}