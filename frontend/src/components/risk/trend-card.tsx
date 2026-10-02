"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendPoint } from "@/lib/types";

interface TrendCardProps {
  title: string;
  trend: TrendPoint;
  unit?: string;
}

function barWidth(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "0%";
  return `${Math.min(100, Math.max(0, value))}%`;
}

function trendLabel(t: TrendPoint): string {
  if (t.trend === "INSUFFICIENT_DATA") return "Insufficient data";
  if (t.trend === "DECLINING") return `Declining (${t.change} pts)`;
  if (t.trend === "IMPROVING") return `Improving (+${t.change} pts)`;
  return "Stable";
}

export function TrendCard({ title, trend, unit = "%" }: TrendCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Previous</span>
          <span className="font-medium">{trend.previous ?? "—"}{trend.previous !== null ? unit : ""}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded">
          <div className="h-2 bg-gray-300 rounded" style={{ width: barWidth(trend.previous) }} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Current</span>
          <span className="font-medium">{trend.current ?? "—"}{trend.current !== null ? unit : ""}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded">
          <div
            className={`h-2 rounded ${trend.trend === "DECLINING" ? "bg-red-400" : trend.trend === "IMPROVING" ? "bg-green-400" : "bg-blue-400"}`}
            style={{ width: barWidth(trend.current) }}
          />
        </div>
        <p className="text-xs text-gray-500">{trendLabel(trend)}</p>
      </CardContent>
    </Card>
  );
}
