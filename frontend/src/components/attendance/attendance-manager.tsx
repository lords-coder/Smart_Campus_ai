"use client";

import { useState } from "react";
import { CheckCheck, CalendarX2, RotateCcw, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import {
  attendanceStatusClass,
  formatTime,
  toISODate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AttendanceStatus,
  AttendanceSubmitResult,
  ClassAttendanceState,
  FacultyClass,
  FacultyClasses,
} from "@/lib/types";

const DEFAULT_STATUS: AttendanceStatus = "PRESENT";

function statusLabel(status: AttendanceStatus | null): string {
  if (!status) return "Not recorded";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function toDraft(state: ClassAttendanceState): Record<string, AttendanceStatus> {
  const draft: Record<string, AttendanceStatus> = {};
  for (const student of state.students) {
    draft[student.studentId] = student.status ?? DEFAULT_STATUS;
  }
  return draft;
}

export function AttendanceManager() {
  const today = toISODate();
  const [date, setDate] = useState(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const classesApi = useApi<FacultyClasses>("/attendance/classes");
  const classes = classesApi.data?.classes ?? [];

  const rosterPath = selectedId ? `/attendance/classes/${selectedId}?date=${date}` : null;
  const rosterApi = useApi<ClassAttendanceState>(rosterPath);
  const state = rosterApi.data;

  // Keep the selection valid whenever the class list arrives or changes.
  if (classes.length > 0 && (selectedId === null || !classes.some((c) => c.id === selectedId))) {
    setSelectedId(classes[0].id);
  }

  // Seed the draft from the server whenever a different class/date arrives.
  const draftKey = state
    ? `${state.class.id}|${state.date}|${state.students.map((s) => `${s.studentId}:${s.status ?? "-"}`).join(",")}`
    : "none";
  const [lastDraftKey, setLastDraftKey] = useState("");
  if (state && draftKey !== lastDraftKey) {
    setLastDraftKey(draftKey);
    setDraft(toDraft(state));
    setSubmitError(null);
  }

  const rosterLoading = rosterApi.loading || (rosterPath !== null && state?.date !== date);
  const isDirty =
    state?.students.some((student) => (draft?.[student.studentId] ?? DEFAULT_STATUS) !== student.status) ??
    false;
  const canSubmit = !rosterLoading && !submitting && isDirty && (state?.students.length ?? 0) > 0;

  const markAll = (status: AttendanceStatus) => {
    if (!state) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const student of state.students) next[student.studentId] = status;
    setDraft(next);
  };

  const resetDraft = () => {
    if (!state) return;
    setDraft(toDraft(state));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!state || !draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<AttendanceSubmitResult>("/attendance", {
        method: "POST",
        body: {
          timetableEntryId: state.class.id,
          date: state.date,
          attendance: state.students.map((student) => ({
            studentId: student.studentId,
            status: draft[student.studentId] ?? DEFAULT_STATUS,
          })),
        },
      });
      toast.success(
        `${result.isUpdate ? "Updated" : "Submitted"} ${result.courseCode} · ${result.section} · ${result.date}`,
        { description: `${result.counts.PRESENT} present · ${result.counts.ABSENT} absent · ${result.counts.LATE} late` },
      );
      rosterApi.reload();
    } catch (error) {
      const message = apiErrorMessage(error);
      setSubmitError(message);
      toast.error("Attendance was not saved", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClass = classes.find((entry) => entry.id === selectedId) ?? null;
  const draftCounts = state?.students.reduce(
    (acc, student) => {
      const status = draft?.[student.studentId] ?? DEFAULT_STATUS;
      acc[status] += 1;
      return acc;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } as Record<AttendanceStatus, number>,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <Label htmlFor="attendance-date">Session date</Label>
            <Input
              id="attendance-date"
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className="w-full sm:w-48"
            />
            <p className="text-xs text-muted-foreground">
              Select a class on the left, then mark each student.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => markAll("PRESENT")} disabled={!state}>
              <CheckCheck className="mr-2 h-4 w-4" />
              All present
            </Button>
            <Button variant="outline" size="sm" onClick={() => markAll("ABSENT")} disabled={!state}>
              <CalendarX2 className="mr-2 h-4 w-4" />
              All absent
            </Button>
            <Button variant="ghost" size="sm" onClick={resetDraft} disabled={!state}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Your classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {classesApi.loading ? (
              <LoadingState label="Loading classes..." />
            ) : classesApi.error ? (
              <ErrorState message={classesApi.error} onRetry={classesApi.reload} />
            ) : classes.length === 0 ? (
              <EmptyState
                title="No classes assigned"
                description="Your timetable entries will appear here once they are published."
                icon={<CalendarCheck className="h-6 w-6" />}
              />
            ) : (
              <ul className="space-y-2">
                {classes.map((entry: FacultyClass) => {
                  const active = entry.id === selectedId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{entry.course.code}</span>
                          <Badge variant="outline">Section {entry.section}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {entry.course.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.day} · {formatTime(entry.startTime)}–{formatTime(entry.endTime)} ·{" "}
                          {entry.room}
                        </p>
                        <p className="mt-1 text-xs font-medium">{entry.studentCount} students</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{selectedClass ? `${selectedClass.course.code} · Section ${selectedClass.section}` : "Class roster"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedClass ? `${selectedClass.course.name} · ${selectedClass.room}` : "Select a class to load its students"}
              </p>
            </div>
            {state && (
              <Badge variant={state.alreadySubmitted ? "secondary" : "outline"}>
                {state.alreadySubmitted
                  ? `Recorded ${state.recordedCount}/${state.students.length}`
                  : "Not recorded yet"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <EmptyState
                title="No class selected"
                description="Choose one of your assigned classes to start marking."
              />
            ) : rosterLoading ? (
              <LoadingState label="Loading students..." />
            ) : rosterApi.error ? (
              <ErrorState message={rosterApi.error} onRetry={rosterApi.reload} />
            ) : !state || state.students.length === 0 ? (
              <EmptyState
                title="No enrolled students"
                description="No active enrollments were found for this class and section."
              />
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Saved value</TableHead>
                        <TableHead className="text-right">Mark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.students.map((student) => {
                        const value = draft?.[student.studentId] ?? DEFAULT_STATUS;
                        return (
                          <TableRow key={student.studentId}>
                            <TableCell>
                              <div className="font-medium">{student.name}</div>
                              <div className="text-xs text-muted-foreground">{student.studentNo}</div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={student.status ? attendanceStatusClass[student.status] : "text-muted-foreground"}
                              >
                                {statusLabel(student.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={value === "PRESENT" ? "default" : "outline"}
                                  className="h-8 px-3"
                                  onClick={() =>
                                    setDraft((prev) => ({ ...prev, [student.studentId]: "PRESENT" }))
                                  }
                                >
                                  Present
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={value === "ABSENT" ? "destructive" : "outline"}
                                  className="h-8 px-3"
                                  onClick={() =>
                                    setDraft((prev) => ({ ...prev, [student.studentId]: "ABSENT" }))
                                  }
                                >
                                  Absent
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {submitError && <ErrorState title="Submission failed" message={submitError} onRetry={submit} />}

                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{draftCounts?.PRESENT ?? 0}</span> present ·{" "}
                    <span className="font-medium text-foreground">{draftCounts?.ABSENT ?? 0}</span> absent
                    {!isDirty && state.alreadySubmitted && " · all changes saved"}
                  </p>
                  <Button onClick={submit} disabled={!canSubmit}>
                    {submitting ? "Saving..." : state.alreadySubmitted ? "Update attendance" : "Submit attendance"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
