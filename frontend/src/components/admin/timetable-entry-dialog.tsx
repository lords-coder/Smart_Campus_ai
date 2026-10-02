"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api, apiErrorMessage } from "@/lib/api";
import type {
  AdminTimetableEntry,
  TimetableConflict,
  TimetableConflictDetails,
  TimetableDayName,
  TimetableOptions,
} from "@/lib/types";

const DAYS: TimetableDayName[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function defaultDay(): TimetableDayName {
  const names: TimetableDayName[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const name = names[new Date().getDay()];
  return name === "Sunday" ? "Monday" : name;
}

interface TimetableEntryDialogProps {
  open: boolean;
  mode: "create" | "edit";
  entry: AdminTimetableEntry | null;
  options: TimetableOptions | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TimetableEntryDialog({
  open,
  mode,
  entry,
  options,
  onClose,
  onSaved,
}: TimetableEntryDialogProps) {
  const [courseId, setCourseId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [section, setSection] = useState("");
  const [room, setRoom] = useState("");
  const [day, setDay] = useState<TimetableDayName>(defaultDay());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset the form whenever a different dialog instance opens (render-phase).
  const resetKey = `${open}:${mode}:${entry?.id ?? "new"}`;
  const [lastResetKey, setLastResetKey] = useState<string | null>(null);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setCourseId(entry?.course.id ?? options?.courses[0]?.id ?? "");
    setFacultyId(entry?.faculty?.id ?? options?.faculties[0]?.id ?? "");
    setSection(entry?.section ?? "");
    setRoom(entry?.room ?? "");
    setDay(entry?.day ?? defaultDay());
    setStartTime(entry?.startTime ?? "09:00");
    setEndTime(entry?.endTime ?? "10:00");
    setIsActive(entry?.isActive ?? true);
    setFormError(null);
    setConflicts([]);
    setSaving(false);
  }

  // Options arrive after the dialog is built: fill the create-form defaults.
  if (open && mode === "create" && options && courseId === "" && facultyId === "") {
    setCourseId(options.courses[0]?.id ?? "");
    setFacultyId(options.faculties[0]?.id ?? "");
  }

  const selectedCourse = options?.courses.find((course) => course.id === courseId) ?? null;
  const sectionChoices = (options?.sections ?? []).filter(
    (choice) => !selectedCourse || choice.semester === selectedCourse.semester,
  );
  const validSection = sectionChoices.some((choice) => choice.section === section);
  const effectiveSection = validSection ? section : (sectionChoices[0]?.section ?? "");

  const applyCourse = (nextCourseId: string) => {
    setCourseId(nextCourseId);
    const course = options?.courses.find((item) => item.id === nextCourseId);
    if (!course) return;
    const choices = (options?.sections ?? []).filter((choice) => choice.semester === course.semester);
    const currentValid = choices.some((choice) => choice.section === section);
    if (!currentValid) setSection(choices[0]?.section ?? "");
  };

  const submit = async () => {
    if (!options) return;
    if (!courseId || !facultyId || !effectiveSection || !room.trim()) {
      setFormError("Course, faculty, section and room are all required.");
      return;
    }
    if (startTime >= endTime) {
      setFormError("End time must be after the start time.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setConflicts([]);
    try {
      const body = {
        courseId,
        facultyId,
        section: effectiveSection,
        room: room.trim(),
        day,
        startTime,
        endTime,
        ...(mode === "edit" ? { isActive } : {}),
      };
      await api(mode === "edit" && entry ? `/timetable/${entry.id}` : "/timetable", {
        method: mode === "edit" ? "PATCH" : "POST",
        body,
      });
      toast.success(mode === "edit" ? "Timetable entry updated" : "Timetable entry created", {
        description: `${day} ${startTime}–${endTime} · ${room.trim()} · Section ${effectiveSection}`,
      });
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "TIMETABLE_CONFLICT") {
        const details = error.details as TimetableConflictDetails | undefined;
        setConflicts(details?.conflicts ?? []);
      }
      const message = apiErrorMessage(error);
      setFormError(message);
      toast.error("Timetable entry was not saved", { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit timetable entry" : "Add a class"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Changes are re-checked against faculty, room and section conflicts."
              : "The slot is validated against faculty, room and section conflicts before it is saved."}
          </DialogDescription>
        </DialogHeader>

        {!options ? (
          <LoadingState label="Loading courses, faculty and sections..." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tt-course">Course</Label>
              <Select value={courseId} onValueChange={applyCourse}>
                <SelectTrigger id="tt-course" className="w-full">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {options.courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.code} · {course.name} (Sem {course.semester})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-faculty">Faculty</Label>
              <Select value={facultyId} onValueChange={setFacultyId}>
                <SelectTrigger id="tt-faculty" className="w-full">
                  <SelectValue placeholder="Select faculty" />
                </SelectTrigger>
                <SelectContent>
                  {options.faculties.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-section">Section</Label>
              <Select value={effectiveSection} onValueChange={setSection}>
                <SelectTrigger id="tt-section" className="w-full">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sectionChoices.map((choice) => (
                    <SelectItem key={`${choice.semester}-${choice.section}`} value={choice.section}>
                      Section {choice.section} · {choice.studentCount} students
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-room">Room</Label>
              <Input
                id="tt-room"
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="L-201"
                maxLength={40}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-day">Day</Label>
              <Select value={day} onValueChange={(value) => setDay(value as TimetableDayName)}>
                <SelectTrigger id="tt-day" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-start">Start time</Label>
              <Input
                id="tt-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-end">End time</Label>
              <Input
                id="tt-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>

            {mode === "edit" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tt-status">Status</Label>
                <Select
                  value={isActive ? "ACTIVE" : "ARCHIVED"}
                  onValueChange={(value) => setIsActive(value === "ACTIVE")}
                >
                  <SelectTrigger id="tt-status" className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active - visible to students and faculty</SelectItem>
                    <SelectItem value="ARCHIVED">Archived - hidden everywhere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">Scheduling conflict</p>
            {conflicts.map((conflict) => (
              <p key={`${conflict.entryId}-${conflict.type}`} className="text-xs text-destructive/90">
                {conflict.type}: {conflict.message}
              </p>
            ))}
          </div>
        )}

        {formError && <ErrorState title="Could not save entry" message={formError} />}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            id="tt-submit"
            onClick={submit}
            disabled={saving || !options}
          >
            {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Add class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
