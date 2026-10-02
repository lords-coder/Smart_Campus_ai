"use client";

import { Button } from "@/components/ui/button";

export interface RiskFilterState {
  riskLevel: string;
  declining: string;
}

interface RiskFiltersProps {
  filters: RiskFilterState;
  onChange: (filters: RiskFilterState) => void;
}

const LEVELS = [
  { value: "all", label: "All levels" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MODERATE", label: "Moderate" },
  { value: "LOW", label: "Low" },
];

const DECLINING = [
  { value: "all", label: "All trends" },
  { value: "attendance", label: "Declining attendance" },
  { value: "assessments", label: "Declining assessments" },
  { value: "assignments", label: "Declining assignments" },
];

export function RiskFilters({ filters, onChange }: RiskFiltersProps) {
  return (
    <div className="space-y-2 mb-6">
      <div className="flex flex-wrap gap-2" id="risk-level-filters">
        {LEVELS.map((f) => (
          <Button
            key={f.value}
            variant={filters.riskLevel === f.value ? "default" : "outline"}
            size="sm"
            data-testid={`risk-filter-${f.value.toLowerCase()}`}
            onClick={() => onChange({ ...filters, riskLevel: f.value })}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {DECLINING.map((f) => (
          <Button
            key={f.value}
            variant={filters.declining === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ ...filters, declining: f.value })}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
