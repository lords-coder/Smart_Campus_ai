"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/components/providers/auth-provider";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { AlumniDirectoryItem, Mentorship } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800 border-amber-300",
  ACCEPTED: "bg-green-100 text-green-800 border-green-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  COMPLETED: "bg-blue-100 text-blue-800 border-blue-300",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-300",
};

export function MentorshipArea() {
  const { user } = useAuth();
  if (user?.role === "ALUMNI") return <AlumniMentorship />;
  return <StudentMentorship />;
}

function StudentMentorship() {
  const mentors = useApi<{ items: AlumniDirectoryItem[]; total: number }>(
    "/alumni/directory?mentorsOnly=true&limit=20",
  );
  const mine = useApi<{ mentorships: Mentorship[] }>("/alumni/me/mentorship-requests");
  const [selectedMentor, setSelectedMentor] = useState<string | null>(null);

  const reload = () => {
    mine.reload();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find a mentor ({mentors.data?.total ?? 0} offering)</CardTitle>
        </CardHeader>
        <CardContent>
          {mentors.loading ? (
            <LoadingState label="Loading mentors..." />
          ) : (mentors.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No mentors are offering guidance right now.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {(mentors.data?.items ?? []).map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedMentor(m.id)}
                    className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedMentor === m.id ? "border-primary" : ""}`}
                  >
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.currentPosition} · {m.currentCompany}</p>
                    {m.mentorshipTopics && <p className="mt-1 text-xs text-primary">{m.mentorshipTopics}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedMentor && (
        <MentorRequestDialog
          mentorId={selectedMentor}
          onClose={() => setSelectedMentor(null)}
          onSaved={reload}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>My requests ({mine.data?.mentorships.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.loading ? (
            <LoadingState label="Loading requests..." />
          ) : (mine.data?.mentorships.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No mentorship requests yet.</p>
          ) : (
            <MentorshipList items={mine.data?.mentorships ?? []} perspective="student" onChanged={reload} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MentorRequestDialog({
  mentorId,
  onClose,
  onSaved,
}: {
  mentorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/alumni/mentorships", { method: "POST", body: { alumniId: mentorId, topic, message } });
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Request mentorship</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="ms-topic">Topic</label>
              <input
                id="ms-topic"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                minLength={2}
                maxLength={200}
                placeholder="e.g. Backend Development"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ms-message">Why do you want guidance? (optional)</label>
              <textarea
                id="ms-message"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Sending..." : "Send request"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AlumniMentorship() {
  const { data, loading, error, reload } = useApi<{ mentorships: Mentorship[] }>("/alumni/me/mentorships");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading mentorships..." />;
  const items = data?.mentorships ?? [];
  const incoming = items.filter((m) => m.status === "REQUESTED");
  const rest = items.filter((m) => m.status !== "REQUESTED");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Incoming requests ({incoming.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {incoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending mentorship requests.</p>
          ) : (
            <MentorshipList items={incoming} perspective="alumni" onChanged={reload} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mentoring history ({rest.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rest.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <MentorshipList items={rest} perspective="alumni" onChanged={reload} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MentorshipList({
  items,
  perspective,
  onChanged,
}: {
  items: Mentorship[];
  perspective: "student" | "alumni";
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/alumni/me/mentorships/${id}`, { method: "PATCH", body: { status } });
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/alumni/mentorships/${id}/cancel`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                {perspective === "student" ? m.alumniName : m.studentName} · {m.topic}
              </p>
              <p className="text-xs text-muted-foreground">
                Requested {m.requestedAt.slice(0, 10)}
                {m.message ? ` · ${m.message.slice(0, 80)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={STATUS_STYLES[m.status] ?? ""}>{m.status}</Badge>
              {perspective === "alumni" && m.status === "REQUESTED" && (
                <>
                  <button className="text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === m.id} onClick={() => act(m.id, "ACCEPTED")}>
                    Accept
                  </button>
                  <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy === m.id} onClick={() => act(m.id, "REJECTED")}>
                    Reject
                  </button>
                </>
              )}
              {perspective === "alumni" && m.status === "ACCEPTED" && (
                <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={busy === m.id} onClick={() => act(m.id, "COMPLETED")}>
                  Complete
                </button>
              )}
              {perspective === "student" && (m.status === "REQUESTED" || m.status === "ACCEPTED") && (
                <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy === m.id} onClick={() => cancel(m.id)}>
                  Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
