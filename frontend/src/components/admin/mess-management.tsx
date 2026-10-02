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

type Tab = "plans" | "menu" | "meals" | "canteen" | "orders" | "billing" | "feedback";

export function MessManagement() {
  const [tab, setTab] = useState<Tab>("plans");
  const [dialog, setDialog] = useState<"plan" | "menu" | "item" | "meal" | "billing" | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["plans", "menu", "meals", "canteen", "orders", "billing", "feedback"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("plan")}>New plan</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("menu")}>New menu entry</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("item")}>New canteen item</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("meal")}>Record meal</Button>
          <Button size="sm" onClick={() => setDialog("billing")}>Run billing</Button>
        </div>
      </div>

      <div key={version}>
        {tab === "plans" && <PlansSection />}
        {tab === "menu" && <MenuSection />}
        {tab === "meals" && <MealsSection />}
        {tab === "canteen" && <CanteenSection />}
        {tab === "orders" && <OrdersSection />}
        {tab === "billing" && <BillingSection />}
        {tab === "feedback" && <FeedbackSection />}
      </div>

      {dialog && (
        <AdminMessDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function PlansSection() {
  const { data, loading, error, reload } = useApi<{ plans: Array<Record<string, unknown>> }>("/admin/mess/plans");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading plans..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Meal plans ({data?.plans.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Billing</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.plans ?? []).map((p) => (
                <tr key={p.id as string} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name as string}</td>
                  <td className="px-4 py-2">{p.billing_type as string}</td>
                  <td className="px-4 py-2">{formatCurrency(Number(p.price))}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{p.active ? "ACTIVE" : "INACTIVE"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MenuSection() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, loading, error, reload } = useApi<{ menu: Array<Record<string, unknown>> }>(
    `/admin/mess/menu?from=${today}&to=${today}`,
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading menu..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Today&apos;s menu ({data?.menu.length ?? 0}/4 meals)</CardTitle></CardHeader>
      <CardContent>
        {(data?.menu.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No menu published for today yet.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.menu ?? []).map((m) => (
              <li key={m.id as string} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{m.meal_type as string}</p>
                  <p className="text-xs text-muted-foreground">{m.menu_description as string}</p>
                </div>
                <span className="text-xs text-muted-foreground">{m.calories as number} kcal</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MealsSection() {
  const { data, loading, error, reload } = useApi<{ meals: Array<Record<string, unknown>> }>("/admin/mess/meals?limit=50");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading meal records..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Recent meal records ({data?.meals.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Meal</th>
                <th className="px-4 py-2 font-medium">Consumed</th>
              </tr>
            </thead>
            <tbody>
              {(data?.meals ?? []).map((m) => (
                <tr key={m.id as string} className="border-t">
                  <td className="px-4 py-2">{m.studentName as string} <span className="text-xs text-gray-500">({m.studentNo as string})</span></td>
                  <td className="px-4 py-2">{m.mealDate as string}</td>
                  <td className="px-4 py-2">{m.mealType as string}</td>
                  <td className="px-4 py-2">{m.consumed ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CanteenSection() {
  const { data, loading, error, reload } = useApi<{ items: Array<Record<string, unknown>> }>("/admin/mess/items");
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(id: string, available: boolean) {
    setBusy(id);
    try {
      await api(`/admin/mess/items/${id}`, { method: "PATCH", body: { available: !available } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading canteen..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Canteen items ({data?.items.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Available</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id as string} className="border-t">
                  <td className="px-4 py-2 font-medium">{item.name as string}</td>
                  <td className="px-4 py-2">{item.category as string}</td>
                  <td className="px-4 py-2">{formatCurrency(Number(item.price))}</td>
                  <td className="px-4 py-2">{item.available ? "Yes" : "No"}</td>
                  <td className="px-4 py-2">
                    <button
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                      disabled={busy === (item.id as string)}
                      onClick={() => toggle(item.id as string, Boolean(item.available))}
                    >
                      {item.available ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersSection() {
  const [status, setStatus] = useState("all");
  const { data, loading, error, reload } = useApi<{ orders: Array<Record<string, unknown>> }>(
    `/admin/mess/orders${status === "all" ? "" : `?status=${status}`}`,
  );
  const [busy, setBusy] = useState<string | null>(null);
  async function advance(id: string, to: string) {
    setBusy(id);
    try {
      await api(`/admin/mess/orders/${id}`, { method: "PATCH", body: { status: to } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  const nextOf: Record<string, string> = { PENDING: "CONFIRMED", CONFIRMED: "READY", READY: "COMPLETED" };
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading orders..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Orders ({data?.orders.length ?? 0})</CardTitle>
        <select className="border rounded px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {["all", "PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {(data?.orders.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No orders match.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.orders ?? []).map((o) => (
              <li key={o.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{formatCurrency(Number(o.totalAmount ?? o.total_amount ?? 0))} · {(o.studentName as string) ?? ""}</p>
                  <p className="text-xs text-muted-foreground">{(o.orderedAt as string)?.slice(0, 16).replace("T", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.status as string}</Badge>
                  {nextOf[o.status as string] && (
                    <button className="text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === (o.id as string)} onClick={() => advance(o.id as string, nextOf[o.status as string])}>
                      Mark {nextOf[o.status as string]}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BillingSection() {
  return (
    <Card>
      <CardHeader><CardTitle>Monthly billing</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Use the “Run billing” button above for a single student or a whole month.
          Billing recomputes the two period fee rows, so re-running never duplicates charges.
        </p>
      </CardContent>
    </Card>
  );
}

function FeedbackSection() {
  const { data, loading, error, reload } = useApi<{
    byMealType: Array<{ mealType: string; avgRating: number; count: number }>;
    recentCount: number;
  }>("/admin/mess/feedback");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading feedback..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Feedback ratings</CardTitle></CardHeader>
      <CardContent>
        {(data?.byMealType.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback yet.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.byMealType ?? []).map((f) => (
              <li key={f.mealType} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="font-medium">{f.mealType}</span>
                <span>{f.avgRating.toFixed(1)} / 5 · {f.count} rating(s)</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdminMessDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: "plan" | "menu" | "item" | "meal" | "billing";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const titles = { plan: "New meal plan", menu: "New menu entry", item: "New canteen item", meal: "Record meal", billing: "Run monthly billing" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      if (kind === "plan") {
        await api("/admin/mess/plans", {
          method: "POST",
          body: { name: form.name, description: form.description || "", billingType: form.billingType || "MONTHLY", price: Number(form.price || 0), mealsPerDay: Number(form.mealsPerDay || 4) },
        });
      } else if (kind === "menu") {
        await api("/admin/mess/menu", {
          method: "POST",
          body: { mealDate: form.mealDate, mealType: form.mealType, menuDescription: form.menuDescription, calories: form.calories ? Number(form.calories) : null },
        });
      } else if (kind === "item") {
        await api("/admin/mess/items", {
          method: "POST",
          body: { name: form.name, category: form.category || "OTHER", description: form.description || "", price: Number(form.price || 0) },
        });
      } else if (kind === "meal") {
        await api("/admin/mess/meals/record", {
          method: "POST",
          body: { studentNo: form.studentNo, mealDate: form.mealDate, mealType: form.mealType, consumed: form.consumed !== "false" },
        });
      } else {
        const data = await api<{ month: string; billed: number }>(`/admin/mess/billing`, {
          method: "POST",
          body: { studentNo: form.studentNo || undefined, month: form.month },
        });
        setResult(`Billed ${data.billed} student(s) for ${data.month}. Re-running is safe.`);
      }
      onSaved();
      if (kind !== "billing") onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader><CardTitle>{titles[kind]}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "plan" && (
              <>
                <Field label="Name" value={form.name ?? ""} onChange={set("name")} required />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Billing type</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.billingType ?? "MONTHLY"} onChange={set("billingType")}>
                      <option value="MONTHLY">Monthly</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MEAL_BASED">Per meal</option>
                    </select>
                  </div>
                  <Field label="Price (Rs.)" value={form.price ?? ""} onChange={set("price")} required />
                </div>
                <Field label="Description" value={form.description ?? ""} onChange={set("description")} />
              </>
            )}
            {kind === "menu" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date" value={form.mealDate ?? ""} onChange={set("mealDate")} type="date" required />
                  <div>
                    <label className="text-sm font-medium">Meal</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.mealType ?? "LUNCH"} onChange={set("mealType")}>
                      {["BREAKFAST", "LUNCH", "SNACKS", "DINNER"].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Field label="Menu description" value={form.menuDescription ?? ""} onChange={set("menuDescription")} required />
                <Field label="Calories (optional)" value={form.calories ?? ""} onChange={set("calories")} />
              </>
            )}
            {kind === "item" && (
              <>
                <Field label="Name" value={form.name ?? ""} onChange={set("name")} required />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Category</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.category ?? "OTHER"} onChange={set("category")}>
                      {["BEVERAGE", "SNACK", "MEAL", "DESSERT", "OTHER"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Price (Rs.)" value={form.price ?? ""} onChange={set("price")} required />
                </div>
                <Field label="Description" value={form.description ?? ""} onChange={set("description")} />
              </>
            )}
            {kind === "meal" && (
              <>
                <Field label="Student number" value={form.studentNo ?? ""} onChange={set("studentNo")} required placeholder="SC2025-001" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date" value={form.mealDate ?? ""} onChange={set("mealDate")} type="date" required />
                  <div>
                    <label className="text-sm font-medium">Meal</label>
                    <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.mealType ?? "LUNCH"} onChange={set("mealType")}>
                      {["BREAKFAST", "LUNCH", "SNACKS", "DINNER"].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Consumed</label>
                  <select className="mt-1 w-full border rounded px-2 py-1.5 text-sm" value={form.consumed ?? "true"} onChange={set("consumed")}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </>
            )}
            {kind === "billing" && (
              <>
                <Field label="Month (YYYY-MM)" value={form.month ?? ""} onChange={set("month")} required placeholder="2026-10" />
                <Field label="Student number (optional — blank bills everyone enrolled)" value={form.studentNo ?? ""} onChange={set("studentNo")} placeholder="SC2025-001" />
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {result && <p className="text-sm text-emerald-700">{result}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Close</Button>
              <Button type="submit" disabled={saving}>{saving ? "Working..." : kind === "billing" ? "Run billing" : "Save"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type ?? "text"}
        className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
