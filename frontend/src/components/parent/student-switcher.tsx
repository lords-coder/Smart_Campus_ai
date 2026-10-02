"use client";

import type { ParentLinkedStudent } from "@/lib/types";

interface StudentSwitcherProps {
  students: ParentLinkedStudent[];
  selectedId: string | null;
  onSelect: (studentId: string) => void;
}

export function StudentSwitcher({ students, selectedId, onSelect }: StudentSwitcherProps) {
  if (students.length <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="parent-student" className="text-sm text-muted-foreground">
        Viewing
      </label>
      <select
        id="parent-student"
        className="border rounded px-2 py-1.5 text-sm bg-background"
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        {students.map((s) => (
          <option key={s.studentId} value={s.studentId}>
            {s.name} · {s.studentNo}
          </option>
        ))}
      </select>
    </div>
  );
}
