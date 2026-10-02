"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { AlumniDirectoryItem } from "@/lib/types";

interface DirectoryResponse {
  items: AlumniDirectoryItem[];
  total: number;
  page: number;
  limit: number;
}

export function AlumniDirectory({ mentorsOnly = false }: { mentorsOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [industry, setIndustry] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = [
    applied ? `q=${encodeURIComponent(applied)}` : "",
    industry ? `industry=${encodeURIComponent(industry)}` : "",
    mentorsOnly ? "mentorsOnly=true" : "",
    `page=${page}&limit=12`,
  ].filter(Boolean).join("&");

  const { data, loading, error, reload } = useApi<DirectoryResponse>(`/alumni/directory?${params}`);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading alumni directory..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="border rounded px-2 py-1.5 text-sm flex-1 min-w-40"
          placeholder="Search name, company, or role"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setApplied(query);
              setPage(1);
            }
          }}
          aria-label="Search alumni"
        />
        <input
          className="border rounded px-2 py-1.5 text-sm"
          placeholder="Industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setPage(1);
          }}
          aria-label="Filter by industry"
        />
        <Button
          size="sm"
          onClick={() => {
            setApplied(query);
            setPage(1);
            reload();
          }}
        >
          Search
        </Button>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No alumni match your search.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{data?.total} result(s) · page {data?.page}</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {(data?.items ?? []).map((alum) => (
              <li key={alum.id}>
                <button
                  onClick={() => setSelectedId(alum.id)}
                  className={`w-full rounded-lg border p-3 text-left hover:border-primary/40 ${selectedId === alum.id ? "border-primary" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{alum.name}</p>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Verified</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {alum.currentPosition || "—"} · {alum.currentCompany || "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Class of {alum.graduationYear} · {alum.industry || "—"} · {alum.location || "—"}
                  </p>
                  {alum.offersMentorship && (
                    <p className="mt-1 text-xs font-medium text-primary">Offers mentorship</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={(data?.items.length ?? 0) < 12} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </>
      )}

      {selectedId && <AlumniDetailPanel alumniId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function AlumniDetailPanel({ alumniId, onClose }: { alumniId: string; onClose: () => void }) {
  const { data, loading, error, reload } = useApi<AlumniDirectoryItem>(`/alumni/directory/${alumniId}`);
  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{loading ? "Loading profile..." : data?.name}</CardTitle>
        <button className="text-sm text-muted-foreground hover:underline" onClick={onClose}>Close</button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingState label="Loading profile..." />
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {data.currentPosition} · {data.currentCompany} · Class of {data.graduationYear}
            </p>
            <p><span className="text-muted-foreground">Program:</span> {data.graduationProgram} · {data.department}</p>
            <p><span className="text-muted-foreground">Industry:</span> {data.industry || "—"} · <span className="text-muted-foreground">Location:</span> {data.location || "—"}</p>
            {data.bio && <p className="text-muted-foreground">{data.bio}</p>}
            <div className="flex flex-wrap gap-2">
              {data.linkedinUrl && (
                <a href={data.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                  LinkedIn
                </a>
              )}
              {data.githubUrl && (
                <a href={data.githubUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                  GitHub
                </a>
              )}
            </div>
            {data.offersMentorship && (
              <div className="rounded-lg border p-3">
                <p className="font-medium">Open to mentoring ({data.mentorshipMode})</p>
                {data.mentorshipTopics && <p className="text-xs text-muted-foreground">Topics: {data.mentorshipTopics}</p>}
                {data.availability && <p className="text-xs text-muted-foreground">Availability: {data.availability}</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
