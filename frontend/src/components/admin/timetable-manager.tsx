"use client";

import { useState } from "react";
import { CalendarDays, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { TimetableDeleteDialog } from "@/components/admin/timetable-delete-dialog";
import { TimetableEntryDialog } from "@/components/admin/timetable-entry-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatTime } from "@/lib/format";
import type { AdminTimetableEntry, TimetableList, TimetableOptions } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STATUS_OPTIONS = ["ACTIVE", "ARCHIVED", "ALL"] as const;

export function TimetableManager() {
  const [searchInput, setSearchInput] = useState("");
  const [room, setRoom] = useState("");
  const [day, setDay] = useState("ALL");
  const [section, setSection] = useState("ALL");
  const [facultyId, setFacultyId] = useState("ALL");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ACTIVE");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminTimetableEntry | null>(null);
  const [removing, setRemoving] = useState<AdminTimetableEntry | null>(null);

  const params = new URLSearchParams();
  if (room) params.set("room", room);
  if (day !== "ALL") params.set("day", day);
  if (section !== "ALL") params.set("section", section);
  if (facultyId !== "ALL") params.set("facultyId", facultyId);
  params.set("status", status);

  const { data, loading, error, reload } = useApi<TimetableList>(`/timetable?${params.toString()}`);
  const { data: options, loading: optionsLoading } = useApi<TimetableOptions>("/timetable/options");

  const entries = data?.entries ?? [];
  const sectionChoices = Array.from(
    new Set((options?.sections ?? []).map((choice) => choice.section)),
  ).sort();

  const restore = async (entry: AdminTimetableEntry) => {
    try {
      await api(`/timetable/${entry.id}`, { method: "PATCH", body: { isActive: true } });
      toast.success("Timetable entry restored", {
        description: `${entry.course.code} · ${entry.day} ${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`,
      });
      reload();
    } catch (caught) {
      toast.error("Restore failed", { description: apiErrorMessage(caught) });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Class register</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Admin only</Badge>
            <Badge variant="secondary">{data?.total ?? 0} entries</Badge>
            <Button id="tt-new" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New class
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setRoom(searchInput.trim());
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="tt-room-filter">Room</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="tt-room-filter"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by room"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger id="tt-day-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All days</SelectItem>
                  {DAYS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger id="tt-section-filter" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All sections</SelectItem>
                  {sectionChoices.map((name) => (
                    <SelectItem key={name} value={name}>
                      Section {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Faculty</Label>
              <Select value={facultyId} onValueChange={setFacultyId}>
                <SelectTrigger id="tt-faculty-filter" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All faculty</SelectItem>
                  {(options?.faculties ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number])}
              >
                <SelectTrigger id="tt-status-filter" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "ALL"
                        ? "All statuses"
                        : option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                Search
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setRoom("");
                  setDay("ALL");
                  setSection("ALL");
                  setFacultyId("ALL");
                  setStatus("ACTIVE");
                }}
              >
                Clear
              </Button>
            </div>
          </form>

          {loading || optionsLoading ? (
            <LoadingState label="Loading timetable..." />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : entries.length === 0 ? (
            <EmptyState
              title="No matching classes"
              description="Adjust the filters or add a new class to the register."
              icon={<CalendarDays className="h-6 w-6" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.day.slice(0, 3)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.course.code}</div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {entry.course.name}
                        </div>
                      </TableCell>
                      <TableCell>{entry.faculty?.name ?? "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.section}</Badge>
                      </TableCell>
                      <TableCell>{entry.room}</TableCell>
                      <TableCell className="text-right">{entry.studentCount}</TableCell>
                      <TableCell>
                        <Badge variant={entry.isActive ? "secondary" : "outline"}>
                          {entry.isActive ? "Active" : "Archived"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {entry.isActive ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditing(entry);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRemoving(entry)}
                              >
                                Archive
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => restore(entry)}>
                                <RotateCcw className="h-4 w-4" />
                                Restore
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRemoving(entry)}>
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <TimetableEntryDialog
        open={creating}
        mode="create"
        entry={null}
        options={options ?? null}
        onClose={() => setCreating(false)}
        onSaved={reload}
      />
      <TimetableEntryDialog
        open={editing !== null}
        mode="edit"
        entry={editing}
        options={options ?? null}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
      <TimetableDeleteDialog
        entry={removing}
        onClose={() => setRemoving(null)}
        onChanged={reload}
      />
    </div>
  );
}
