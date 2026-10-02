"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { AlumniProfile } from "@/lib/types";

export function AlumniProfileForm() {
  const { data, loading, error, reload } = useApi<AlumniProfile>("/alumni/me/profile");
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState label="Loading profile..." />;

  const current: Record<string, string | boolean> = form ?? {
    currentCompany: data.currentCompany,
    currentPosition: data.currentPosition,
    industry: data.industry,
    location: data.location,
    bio: data.bio,
    linkedinUrl: data.linkedinUrl,
    githubUrl: data.githubUrl,
    offersMentorship: data.offersMentorship,
    mentorshipTopics: data.mentorshipTopics,
    mentorshipMode: data.mentorshipMode,
    availability: data.availability,
    visibility: data.visibility,
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...(f ?? current), [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload = form ?? {};
      await api("/alumni/me/profile", { method: "PATCH", body: payload });
      setSaved(true);
      setForm(null);
      reload();
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const str = (key: string): string => String(current[key] ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>My alumni profile</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded border px-2 py-0.5">Class of {data.graduationYear}</span>
          <span className="rounded border px-2 py-0.5">{data.verification === "VERIFIED" ? "Verified" : "Unverified"}</span>
          <span className="rounded border px-2 py-0.5">{data.status}</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current company" value={str("currentCompany")} onChange={set("currentCompany")} />
            <Field label="Current position" value={str("currentPosition")} onChange={set("currentPosition")} />
            <Field label="Industry" value={str("industry")} onChange={set("industry")} />
            <Field label="Location" value={str("location")} onChange={set("location")} />
            <Field label="LinkedIn URL" value={str("linkedinUrl")} onChange={set("linkedinUrl")} />
            <Field label="GitHub URL" value={str("githubUrl")} onChange={set("githubUrl")} />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="al-bio">Bio</label>
            <textarea
              id="al-bio"
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
              rows={3}
              maxLength={2000}
              value={str("bio")}
              onChange={set("bio")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mentorship topics" value={str("mentorshipTopics")} onChange={set("mentorshipTopics")} />
            <div>
              <label className="text-sm font-medium" htmlFor="al-mode">Mentorship mode</label>
              <select id="al-mode" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={str("mentorshipMode")} onChange={set("mentorshipMode")}>
                <option value="ONLINE">Online</option>
                <option value="ONSITE">On-site</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <Field label="Availability" value={str("availability")} onChange={set("availability")} />
            <div>
              <label className="text-sm font-medium" htmlFor="al-vis">Directory visibility</label>
              <select id="al-vis" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={str("visibility")} onChange={set("visibility")}>
                <option value="PUBLIC">Public (listed in directory)</option>
                <option value="PRIVATE">Private (hidden from directory)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(current.offersMentorship)}
              onChange={set("offersMentorship")}
            />
            Offer mentorship to students
          </label>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          {saved && <p className="text-sm text-emerald-700">Profile saved.</p>}
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={value} onChange={onChange} maxLength={500} />
    </div>
  );
}
