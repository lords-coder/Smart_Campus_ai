"use client";

import { Button } from "@/components/ui/button";

interface RecommendationFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export function RecommendationFilters({ activeFilter, onFilterChange }: RecommendationFiltersProps) {
  const filters = [
    { value: "all", label: "All" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {filters.map((filter) => (
        <Button
          key={filter.value}
          variant={activeFilter === filter.value ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(filter.value)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}