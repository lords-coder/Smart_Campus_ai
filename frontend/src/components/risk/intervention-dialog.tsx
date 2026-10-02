"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, apiErrorMessage } from "@/lib/api";
import type { Intervention, InterventionStatus, InterventionType } from "@/lib/types";

const TYPES: Array<{ value: InterventionType; label: string }> = [
  { value: "ACADEMIC_REVIEW", label: "Academic review" },
  { value: "ATTENDANCE_SUPPORT", label: "Attendance support" },
  { value: "ASSESSMENT_SUPPORT", label: "Assessment support" },
  { value: "ASSIGNMENT_SUPPORT", label: "Assignment support" },
  { value: "REMEDIAL_SUPPORT", label: "Remedial support" },
  { value: "FACULTY_MEETING", label: "Faculty meeting" },
  { value: "GENERAL_FOLLOW_UP", label: "General follow-up" },
];

const STATUSES: Array<{ value: InterventionStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DISMISSED", label: "Dismissed" },
];

interface InterventionDialogProps {
  studentId: string;
  baseApiPath: string;
  editing?: Intervention | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InterventionDialog({ studentId, baseApiPath, editing, onClose, onSaved }: InterventionDialogProps) {
  const [interventionType, setInterventionType] = useState<InterventionType>(editing?.intervention_type ?? "ACADEMIC_REVIEW");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState(editing?.follow_up_date?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<InterventionStatus>(editing?.status ?? "OPEN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api(`${baseApiPath}/interventions/${editing.id}`, {
          method: "PATCH",
          body: {
            interventionType,
            notes,
            status,
            followUpDate: followUpDate || null,
          },
        });
      } else {
        await api(`${baseApiPath}/students/${studentId}/interventions`, {
          method: "POST",
          body: {
            interventionType,
            notes,
            followUpDate: followUpDate || null,
          },
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{editing ? "Update intervention" : "Create intervention"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="iv-type">Type</label>
              <select
                id="iv-type"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={interventionType}
                onChange={(e) => setInterventionType(e.target.value as InterventionType)}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="iv-notes">Notes</label>
              <textarea
                id="iv-notes"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                rows={4}
                maxLength={2000}
                placeholder="Supportive, factual notes for the student record"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium" htmlFor="iv-followup">Follow-up date</label>
                <input
                  id="iv-followup"
                  type="date"
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              {editing && (
                <div>
                  <label className="text-sm font-medium" htmlFor="iv-status">Status</label>
                  <select
                    id="iv-status"
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InterventionStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create intervention"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
