"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { formatCurrency } from "@/lib/format";
import type { AlumniCampaign, AlumniContribution } from "@/lib/types";

export function AlumniCampaigns() {
  const { user } = useAuth();
  const isAlumni = user?.role === "ALUMNI";
  const campaigns = useApi<{ campaigns: AlumniCampaign[] }>("/alumni/campaigns");
  const mine = useApi<{ contributions: AlumniContribution[] }>(isAlumni ? "/alumni/me/contributions" : null);
  const [pledging, setPledging] = useState<string | null>(null);

  if (campaigns.error) return <ErrorState message={campaigns.error} onRetry={campaigns.reload} />;
  if (campaigns.loading) return <LoadingState label="Loading campaigns..." />;

  const items = campaigns.data?.campaigns ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Active campaigns ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active campaigns right now.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((campaign) => (
                <li key={campaign.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{campaign.title}</p>
                    <Badge variant="outline">{campaign.status}</Badge>
                  </div>
                  {campaign.description && <p className="mt-1 text-xs text-muted-foreground">{campaign.description}</p>}
                  <div className="mt-2 h-2 rounded bg-gray-100">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{ width: `${campaign.targetAmount > 0 ? Math.min(100, (campaign.recordedTotal / campaign.targetAmount) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(campaign.recordedTotal)} of {formatCurrency(campaign.targetAmount)} recorded · {campaign.contributionCount} contribution(s)
                  </p>
                  {isAlumni && (
                    <div className="mt-2">
                      {pledging === campaign.id ? (
                        <PledgeForm
                          campaignId={campaign.id}
                          onClose={() => setPledging(null)}
                          onSaved={() => {
                            setPledging(null);
                            campaigns.reload();
                            mine.reload();
                          }}
                        />
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setPledging(campaign.id)}>
                          Pledge contribution
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAlumni && (
        <Card>
          <CardHeader>
            <CardTitle>My contributions ({mine.data?.contributions.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.loading ? (
              <LoadingState label="Loading contributions..." />
            ) : (mine.data?.contributions.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No contributions yet. Pledges are recorded intentions, not payments.</p>
            ) : (
              <ul className="space-y-2">
                {(mine.data?.contributions ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{formatCurrency(c.amount)} · {c.campaignTitle}</p>
                      <p className="text-xs text-muted-foreground">{c.createdAt.slice(0, 10)}{c.reference ? ` · ref ${c.reference}` : ""}</p>
                    </div>
                    <Badge variant="outline">{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PledgeForm({
  campaignId,
  onClose,
  onSaved,
}: {
  campaignId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/alumni/me/contributions", {
        method: "POST",
        body: { campaignId, amount: Number(amount), reference },
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <div>
        <label className="text-xs font-medium" htmlFor={`pledge-${campaignId}`}>Amount (Rs.)</label>
        <input
          id={`pledge-${campaignId}`}
          type="number"
          min={1}
          className="mt-1 w-32 border rounded px-2 py-1.5 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="flex-1 min-w-32">
        <label className="text-xs font-medium">Reference (optional)</label>
        <input
          className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          maxLength={200}
          aria-label="Reference"
        />
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      <Button size="sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Pledge"}</Button>
      <Button size="sm" variant="outline" type="button" onClick={onClose}>Cancel</Button>
    </form>
  );
}
