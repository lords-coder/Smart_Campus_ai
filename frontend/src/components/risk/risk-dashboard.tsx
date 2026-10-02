"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { RiskSummary } from "./risk-summary";
import { RiskFilters, type RiskFilterState } from "./risk-filters";
import { RiskTable } from "./risk-table";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { RiskListResponse, RiskStats, RiskStudent } from "@/lib/types";

interface RiskDashboardProps {
  basePath: string;
}

function matchesFilters(s: RiskStudent, filters: RiskFilterState, section: string, course: string): boolean {
  if (filters.riskLevel !== "all" && s.riskLevel !== filters.riskLevel) return false;
  if (filters.declining === "attendance" && !((s.trends.attendance.change ?? 0) <= -3)) return false;
  if (filters.declining === "assessments" && !((s.trends.assessments.change ?? 0) <= -3)) return false;
  if (filters.declining === "assignments" && !((s.trends.assignments.change ?? 0) <= -3)) return false;
  if (section && !s.section.toLowerCase().includes(section.toLowerCase())) return false;
  if (course) {
    const hay = `${s.studentName} ${s.studentNo}`.toLowerCase();
    if (!hay.includes(course.toLowerCase())) return false;
  }
  return true;
}

export function RiskDashboard({ basePath }: RiskDashboardProps) {
  const [filters, setFilters] = useState<RiskFilterState>({ riskLevel: "all", declining: "all" });
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");

  const stats = useApi<RiskStats>("/risk/stats");
  const list = useApi<RiskListResponse>("/risk/students");

  const students = useMemo(
    () => (list.data?.students ?? []).filter((s) => matchesFilters(s, filters, section, search)),
    [list.data, filters, section, search],
  );

  if (stats.error || list.error) {
    return <ErrorState message={stats.error ?? list.error ?? "Failed to load"} onRetry={() => { stats.reload(); list.reload(); }} />;
  }
  if (stats.loading || list.loading) {
    return <LoadingState label="Loading risk indicators..." />;
  }
  if (!stats.data || !list.data) {
    return <ErrorState message="No risk data available" onRetry={() => { stats.reload(); list.reload(); }} />;
  }

  return (
    <div>
      <RiskSummary stats={stats.data} />
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="border rounded px-2 py-1.5 text-sm"
          placeholder="Filter by section (e.g. A)"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          aria-label="Filter by section"
        />
        <input
          className="border rounded px-2 py-1.5 text-sm"
          placeholder="Search name or student no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search students"
        />
        {(filters.riskLevel !== "all" || filters.declining !== "all" || section || search) && (
          <button
            className="text-sm text-primary hover:underline px-2"
            onClick={() => { setFilters({ riskLevel: "all", declining: "all" }); setSection(""); setSearch(""); }}
          >
            Clear filters
          </button>
        )}
      </div>
      <RiskFilters filters={filters} onChange={setFilters} />
      <p className="text-xs text-gray-500 mb-2">
        Showing {students.length} of {list.data.students.length} students in scope · Review recommended where signals appear
      </p>
      <RiskTable students={students} basePath={basePath} />
    </div>
  );
}
