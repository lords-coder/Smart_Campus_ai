"use client";

import { useState } from "react";
import { CalendarDays, MapPin, CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TimetableList } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayName(): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const name = names[new Date().getDay()];
  return name === "Sunday" ? "Monday" : name;
}

/** Read-only weekly view for faculty: the register is managed by admins only. */
export function FacultyTimetable() {
  const [day, setDay] = useState(todayName());
  const { data, loading, error, reload } = useApi<TimetableList>("/timetable");

  const entries = data?.entries ?? [];
  const dayEntries = entries.filter((entry) => entry.day === day);
  const rooms = new Set(entries.map((entry) => entry.room));
  const todayCount = entries.filter((entry) => entry.day === todayName()).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Classes this week"
          value={entries.length}
          hint={`${data?.total ?? 0} assigned slots`}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          title={`On ${todayName()}`}
          value={todayCount}
          hint="Scheduled for today"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          title="Rooms in use"
          value={rooms.size}
          hint="Across your week"
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {DAYS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setDay(name)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              day === name
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Loading your timetable..." />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {dayEntries.length === 0 ? (
              <EmptyState
                title={`No classes on ${day}`}
                description="Pick another day to view your schedule."
                icon={<CalendarDays className="h-6 w-6" />}
              />
            ) : (
              <ul className="divide-y">
                {dayEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <div className="w-full shrink-0 sm:w-44">
                      <p className="text-sm font-semibold">
                        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.room}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.course.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.course.code} · {entry.course.credits} credits · Semester{" "}
                        {entry.semester}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant="outline">Section {entry.section}</Badge>
                      <Badge variant="secondary">{entry.studentCount} students</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
