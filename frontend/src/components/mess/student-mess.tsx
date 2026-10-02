"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { formatCurrency } from "@/lib/format";
import type { FoodFee, MenuEntry, MessEnrollment, MessPlan } from "@/lib/types";

const MEAL_ORDER = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];

export function StudentMess() {
  const plan = useApi<{ enrollment: (MessEnrollment & { planName?: string }) | null }>("/mess/plan");
  const menu = useApi<{ menu: MenuEntry[] }>("/mess/menu?scope=week");
  const billing = useApi<{ enrollment: unknown; outstanding: number; fees: FoodFee[]; recentOrders: unknown[] }>("/mess/billing");
  const [dialogOpen, setDialogOpen] = useState(false);

  const reload = () => {
    plan.reload();
    billing.reload();
  };

  if (plan.error) return <ErrorState message={plan.error} onRetry={reload} />;
  if (plan.loading) return <LoadingState label="Loading mess details..." />;

  const enrollment = plan.data?.enrollment ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My meal plan</CardTitle>
          {!enrollment && <Button size="sm" onClick={() => setDialogOpen(true)}>Choose a plan</Button>}
        </CardHeader>
        <CardContent>
          {!enrollment ? (
            <p className="text-sm text-muted-foreground">You are not enrolled in any mess plan.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{enrollment.planName}</p>
                <p className="text-xs text-muted-foreground">Since {enrollment.startDate} · {enrollment.status}</p>
              </div>
              <CancelEnrollmentButton onDone={reload} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s menu</CardTitle>
        </CardHeader>
        <CardContent>
          {menu.loading ? (
            <LoadingState label="Loading menu..." />
          ) : (menu.data?.menu.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No menu published for this week yet.</p>
          ) : (
            <div className="space-y-3">
              {groupByDate(menu.data?.menu ?? []).map(([date, entries]) => (
                <div key={date}>
                  <p className="text-sm font-medium">{date}</p>
                  <ul className="mt-1 grid gap-2 sm:grid-cols-2">
                    {MEAL_ORDER.map((meal) => {
                      const entry = entries.find((e) => e.mealType === meal);
                      return (
                        <li key={meal} className="rounded-lg border p-2 text-sm">
                          <p className="text-xs font-medium text-muted-foreground">{meal}</p>
                          <p>{entry ? entry.menuDescription : "—"}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mess billing</CardTitle>
        </CardHeader>
        <CardContent>
          {billing.loading ? (
            <LoadingState label="Loading billing..." />
          ) : (
            <div className="space-y-2">
              <p className="text-2xl font-bold">{formatCurrency(billing.data?.outstanding ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Outstanding mess &amp; canteen balance from the fee ledger.</p>
              <ul className="space-y-1">
                {(billing.data?.fees ?? []).map((fee) => (
                  <li key={fee.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-2">
                    <div>
                      <p className="font-medium">{fee.feeType}</p>
                      <p className="text-xs text-muted-foreground">Due {fee.dueDate} · {formatCurrency(fee.amountPaid)} paid</p>
                    </div>
                    <Badge variant="outline">{fee.status}</Badge>
                  </li>
                ))}
              </ul>
              {(billing.data?.fees.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No mess or canteen bills yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && <EnrollDialog onClose={() => setDialogOpen(false)} onSaved={reload} />}
    </div>
  );
}

function groupByDate(entries: MenuEntry[]): Array<[string, MenuEntry[]]> {
  const map = new Map<string, MenuEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.mealDate) ?? [];
    list.push(entry);
    map.set(entry.mealDate, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function CancelEnrollmentButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await api("/mess/enrollment/cancel", { method: "POST" });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
      {busy ? "Cancelling..." : "Cancel enrollment"}
    </Button>
  );
}

function EnrollDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data } = useApi<{ plans: MessPlan[] }>("/mess/plans");
  const [planId, setPlanId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/mess/enroll", { method: "POST", body: { planId } });
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
          <CardTitle>Choose a meal plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="enroll-plan">Plan</label>
              <select id="enroll-plan" className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)} required>
                <option value="">Select a plan</option>
                {(data?.plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {formatCurrency(p.price)} ({p.billingType})</option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Enrolling..." : "Enroll"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
