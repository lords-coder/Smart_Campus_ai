"use client";

import { useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { AdminTimetableEntry } from "@/lib/types";

interface TimetableDeleteDialogProps {
  entry: AdminTimetableEntry | null;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Delete in this app is an archive: attendance rows are not foreign-keyed to a
 * timetable entry, so archiving hides the class everywhere while keeping its
 * history restorable. A hard delete is only offered when the class has no
 * attendance records at all (the backend blocks it otherwise with
 * DEPENDENCY_CONFLICT).
 */
export function TimetableDeleteDialog({ entry, onClose, onChanged }: TimetableDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (permanent: boolean) => {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/timetable/${entry.id}${permanent ? "?permanent=true" : ""}`, {
        method: "DELETE",
      });
      toast.success(permanent ? "Timetable entry deleted" : "Timetable entry archived", {
        description: `${entry.course.code} · ${entry.day} ${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`,
      });
      onChanged();
      onClose();
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setError(message);
      toast.error("Delete was not completed", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const attendance = entry?.attendanceRecordCount ?? 0;
  const canDeletePermanently = attendance === 0;

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>Remove timetable entry</DialogTitle>
              <DialogDescription>
                {entry.course.code} · {entry.day} {formatTime(entry.startTime)}–
                {formatTime(entry.endTime)} · {entry.room} · Section {entry.section}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="font-medium">Archive (recommended)</p>
                <p className="text-xs text-muted-foreground">
                  Hides the class from students, faculty and attendance, keeps every existing
                  attendance record intact, and can be restored at any time.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-medium">Delete permanently</p>
                <p className="text-xs text-muted-foreground">
                  {canDeletePermanently
                    ? "This class has no attendance history, so it can be removed for good."
                    : `Blocked: this class already has ${attendance} attendance records. Archive it so history stays connected.`}
                </p>
              </div>
            </div>

            {error && <ErrorState title="Delete failed" message={error} />}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              {entry.isActive && (
                <Button id="tt-archive" onClick={() => run(false)} disabled={busy}>
                  <Archive className="h-4 w-4" />
                  {busy ? "Working..." : "Archive class"}
                </Button>
              )}
              <Button
                id="tt-delete-permanent"
                variant="destructive"
                onClick={() => run(true)}
                disabled={busy || !canDeletePermanently}
                title={canDeletePermanently ? undefined : "Archive instead: attendance history exists"}
              >
                <Trash2 className="h-4 w-4" />
                Delete permanently
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
