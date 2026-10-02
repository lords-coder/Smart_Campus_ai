"use client";

import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { AlumniEvent } from "@/lib/types";

export function AlumniEvents() {
  const { data, loading, error, reload } = useApi<{ events: AlumniEvent[] }>("/alumni/events");
  const mine = useApi<{ registrations: Array<{ eventId: string; status: string }> }>("/alumni/me/registrations");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const registeredIds = new Set((mine.data?.registrations ?? []).filter((r) => r.status === "REGISTERED").map((r) => r.eventId));

  async function register(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/alumni/events/${id}/register`, { method: "POST" });
      reload();
      mine.reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/alumni/events/${id}/cancel`, { method: "POST" });
      reload();
      mine.reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading events..." />;

  const events = data?.events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming events ({events.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {actionError && <p className="text-sm text-red-600 mb-2">{actionError}</p>}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events right now.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => {
              const registered = registeredIds.has(event.id);
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.startsAt.slice(0, 16).replace("T", " ")} · {event.location || "TBA"} · {event.eventType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.registeredCount}/{event.capacity} registered
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{event.status}</Badge>
                    {registered ? (
                      <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy === event.id} onClick={() => cancel(event.id)}>
                        Cancel registration
                      </button>
                    ) : (
                      <button className="text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === event.id} onClick={() => register(event.id)}>
                        {busy === event.id ? "Registering..." : "Register"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
