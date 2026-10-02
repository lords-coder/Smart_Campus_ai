"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/states/loading-state";

interface FeedbackRow {
  id: string;
  mealDate: string;
  mealType: string;
  rating: number;
  comment: string;
}

export function StudentFeedback() {
  const { data, loading, error, reload } = useApi<{ feedback: FeedbackRow[] }>("/mess/feedback");
  const [mealType, setMealType] = useState("LUNCH");
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await api("/mess/feedback", { method: "POST", body: { mealType, rating, comment } });
      setComment("");
      reload();
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Rate today&apos;s food</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium" htmlFor="fb-meal">Meal</label>
                <select id="fb-meal" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                  {["BREAKFAST", "LUNCH", "SNACKS", "DINNER"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="fb-rating">Rating (1–5)</label>
                <select id="fb-rating" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="fb-comment">Comment (optional)</label>
              <textarea
                id="fb-comment"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What was good? What could improve?"
              />
            </div>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit feedback"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My recent feedback</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading feedback..." />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (data?.feedback.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
          ) : (
            <ul className="space-y-2">
              {(data?.feedback ?? []).map((f) => (
                <li key={f.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{f.mealType} · {f.rating}/5 · {f.mealDate}</p>
                  {f.comment && <p className="text-xs text-muted-foreground">{f.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
