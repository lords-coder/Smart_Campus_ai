"use client";

import Link from "next/link";
import { RiskLevelBadge } from "./risk-level-badge";
import type { RiskStudent } from "@/lib/types";

interface RiskTableProps {
  students: RiskStudent[];
  basePath: string;
}

export function RiskTable({ students, basePath }: RiskTableProps) {
  if (students.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-gray-500">No students match the current filters.</p>
        <p className="text-sm text-gray-400 mt-1">Try clearing the filters to see the full list.</p>
      </div>
    );
  }
  return (
    <div id="risk-table" className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Student</th>
            <th className="px-4 py-2 font-medium">Section</th>
            <th className="px-4 py-2 font-medium">Risk level</th>
            <th className="px-4 py-2 font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Top signals</th>
            <th className="px-4 py-2 font-medium">Interventions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2">
                <Link href={`${basePath}/${s.studentId}`} className="font-medium text-primary hover:underline">
                  {s.studentName}
                </Link>
                <p className="text-xs text-gray-500">{s.studentNo}</p>
              </td>
              <td className="px-4 py-2">{s.section}</td>
              <td className="px-4 py-2">
                <RiskLevelBadge level={s.riskLevel} />
              </td>
              <td className="px-4 py-2 font-medium">{s.riskScore ?? "—"}</td>
              <td className="px-4 py-2 max-w-md">
                {s.signals.length === 0 ? (
                  <span className="text-gray-400">No warning signals</span>
                ) : (
                  <ul className="list-disc list-inside space-y-0.5 text-gray-700">
                    {s.signals.slice(0, 2).map((sig, i) => (
                      <li key={i} className="truncate">{sig}</li>
                    ))}
                    {s.signals.length > 2 && (
                      <li className="text-gray-400">+{s.signals.length - 2} more</li>
                    )}
                  </ul>
                )}
              </td>
              <td className="px-4 py-2">
                {s.openInterventions > 0 ? (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {s.openInterventions} open
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
