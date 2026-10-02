"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TimetableDay } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayName(): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const name = names[new Date().getDay()];
  return name === "Sunday" ? "Monday" : name;
}

function TimetableContent() {
  const [day, setDay] = useState<string>(todayName());
  const { data, loading, error, reload } = useApi<TimetableDay>(
    `/students/me/timetable?day=${day}`,
  );

  return (
    <PageContainer title="Timetable" description="Your weekly class schedule">
      <div className="mb-4 flex flex-wrap gap-2">
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
        <LoadingState label="Loading timetable..." />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {(data?.entries.length ?? 0) === 0 ? (
              <EmptyState
                title={`No classes on ${day}`}
                description="Pick another day to view your schedule."
                icon={<CalendarDays className="h-6 w-6" />}
              />
            ) : (
              <ul className="divide-y">
                {data?.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
                    <div className="w-full shrink-0 sm:w-40">
                      <p className="text-sm font-semibold">
                        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.room}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.course.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.course.code} · {entry.faculty?.name ?? "Faculty TBA"} ·{" "}
                        {entry.course.credits} credits
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit shrink-0">
                      Section {entry.section}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

export default function TimetablePage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <TimetableContent />
    </RoleGuard>
  );
}
