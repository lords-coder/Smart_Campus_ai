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
import type { BookListItem, LibraryReservation, Loan } from "@/lib/types";

type Tab = "catalogue" | "loans" | "overdue" | "reservations" | "fines";

interface PagedBooks {
  items: BookListItem[];
  total: number;
  page: number;
  limit: number;
}

export function LibraryManagement() {
  const [tab, setTab] = useState<Tab>("catalogue");
  const [dialog, setDialog] = useState<"book" | "copy" | "issue" | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["catalogue", "loans", "overdue", "reservations", "fines"] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("book")}>New book</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("copy")}>New copy</Button>
          <Button size="sm" onClick={() => setDialog("issue")}>Issue book</Button>
        </div>
      </div>

      {tab === "catalogue" && <CatalogueSection />}
      {tab === "loans" && <LoansSection />}
      {tab === "overdue" && <OverdueSection />}
      {tab === "reservations" && <ReservationsSection />}
      {tab === "fines" && <FinesSection />}

      {dialog && <LibraryDialog kind={dialog} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
    </div>
  );
}

function CatalogueSection() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<PagedBooks>(
    `/admin/library/books${applied ? `?q=${encodeURIComponent(applied)}` : ""}${applied ? "&" : "?"}page=${page}&limit=12`,
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading catalogue..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Catalogue ({data?.total ?? 0})</CardTitle>
        <div className="flex gap-2">
          <input
            className="border rounded px-2 py-1.5 text-sm"
            placeholder="Search title, author, ISBN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setApplied(query);
                setPage(1);
              }
            }}
            aria-label="Search catalogue"
          />
          <Button size="sm" onClick={() => { setApplied(query); setPage(1); }}>Search</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Author</th>
                <th className="px-4 py-2 font-medium">ISBN</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Copies</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{b.title}</td>
                  <td className="px-4 py-2">{b.author}</td>
                  <td className="px-4 py-2 font-mono text-xs">{b.isbn}</td>
                  <td className="px-4 py-2">{b.category}</td>
                  <td className="px-4 py-2">{b.availableCopies}/{b.totalCopies}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{b.active ? "ACTIVE" : "INACTIVE"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {data?.page}</span>
          <Button size="sm" variant="outline" disabled={(data?.items.length ?? 0) < 12} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoansSection() {
  const { data, loading, error, reload } = useApi<{ loans: Loan[] }>("/admin/library/loans?status=ACTIVE&limit=50");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function returnLoan(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api("/admin/library/return", { method: "POST", body: { loanId: id } });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading loans..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Active loans ({data?.loans.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        {actionError && <p className="text-sm text-red-600 mb-2">{actionError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Book</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.loans ?? []).map((loan) => (
                <tr key={loan.id} className="border-t">
                  <td className="px-4 py-2">{loan.studentName} <span className="text-xs text-gray-500">({loan.studentNo})</span></td>
                  <td className="px-4 py-2">{loan.bookTitle}</td>
                  <td className="px-4 py-2">{loan.dueAt}</td>
                  <td className="px-4 py-2">
                    {loan.overdue ? (
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                        OVERDUE {loan.overdueDays}d · {formatCurrency(loan.currentFine)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">ACTIVE</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={busy === loan.id} onClick={() => returnLoan(loan.id)}>
                      {busy === loan.id ? "Returning..." : "Return"}
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

function OverdueSection() {
  const { data, loading, error, reload } = useApi<{ items: Loan[]; total: number }>("/admin/library/loans?status=OVERDUE&limit=50");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading overdue loans..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Overdue ({data?.total ?? 0})</CardTitle></CardHeader>
      <CardContent>
        {(data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No overdue loans. Fines accrue only on return.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Book</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Days</th>
                  <th className="px-4 py-2 font-medium">Current fine</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((loan) => (
                  <tr key={loan.id} className="border-t">
                    <td className="px-4 py-2">{loan.studentName} <span className="text-xs text-gray-500">({loan.studentNo})</span></td>
                    <td className="px-4 py-2">{loan.bookTitle}</td>
                    <td className="px-4 py-2">{loan.dueAt}</td>
                    <td className="px-4 py-2">{loan.overdueDays}</td>
                    <td className="px-4 py-2 font-medium">{formatCurrency(loan.currentFine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReservationsSection() {
  const [status, setStatus] = useState("WAITING");
  const { data, loading, error, reload } = useApi<{ reservations: LibraryReservation[] }>(
    `/admin/library/reservations?status=${status}`,
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await api(`/admin/library/reservations/${id}/cancel`, { method: "PATCH" });
      reload();
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading reservations..." />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Reservations ({data?.reservations.length ?? 0})</CardTitle>
        <select className="border rounded px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {["WAITING", "READY", "FULFILLED", "CANCELLED", "EXPIRED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {(data?.reservations.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No reservations with this status.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.reservations ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{r.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.studentName} ({r.studentNo}) · position {r.queuePosition ?? "—"} · {r.requestedAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  {(r.status === "WAITING" || r.status === "READY") && (
                    <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => cancel(r.id)}>
                      Cancel
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

function FinesSection() {
  const { data, loading, error, reload } = useApi<{
    fines: Array<{ id: string; loanId: string; bookTitle: string; studentNo: string; studentName: string; amount: number; amountPaid: number; balance: number; status: string; dueDate: string }>;
  }>("/admin/library/fines");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading fines..." />;
  return (
    <Card>
      <CardHeader><CardTitle>Library fines ({data?.fines.length ?? 0})</CardTitle></CardHeader>
      <CardContent>
        {(data?.fines.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No library fines in the ledger. Fines are ordinary fee records, payable through fee management.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Book</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Balance</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.fines ?? []).map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-4 py-2">{f.studentName} <span className="text-xs text-gray-500">({f.studentNo})</span></td>
                    <td className="px-4 py-2">{f.bookTitle}</td>
                    <td className="px-4 py-2">{formatCurrency(f.amount)}</td>
                    <td className="px-4 py-2">{formatCurrency(f.balance)}</td>
                    <td className="px-4 py-2"><Badge variant="outline">{f.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LibraryDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: "book" | "copy" | "issue";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const titles = { book: "New book", copy: "New copy", issue: "Issue book" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "book") {
        await api("/admin/library/books", {
          method: "POST",
          body: { title: form.title, isbn: form.isbn, author: form.author || "Unknown", category: form.category || "General", publisher: form.publisher || "" },
        });
      } else if (kind === "copy") {
        await api("/admin/library/copies", {
          method: "POST",
          body: { bookId: form.bookId, accessionNumber: form.accessionNumber, location: form.location || "Main Stacks" },
        });
      } else {
        await api("/admin/library/issue", {
          method: "POST",
          body: { studentNo: form.studentNo, copyId: form.copyId },
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
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader><CardTitle>{titles[kind]}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {kind === "book" && (
              <>
                <Field label="Title" value={form.title ?? ""} onChange={set("title")} required />
                <Field label="ISBN" value={form.isbn ?? ""} onChange={set("isbn")} required />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Author" value={form.author ?? ""} onChange={set("author")} />
                  <Field label="Category" value={form.category ?? ""} onChange={set("category")} />
                </div>
                <Field label="Publisher" value={form.publisher ?? ""} onChange={set("publisher")} />
              </>
            )}
            {kind === "copy" && (
              <>
                <Field label="Book ID" value={form.bookId ?? ""} onChange={set("bookId")} required placeholder="UUID from catalogue" />
                <Field label="Accession number" value={form.accessionNumber ?? ""} onChange={set("accessionNumber")} required placeholder="ACC-2001" />
                <Field label="Location" value={form.location ?? ""} onChange={set("location")} placeholder="Main Stacks" />
              </>
            )}
            {kind === "issue" && (
              <>
                <Field label="Student number" value={form.studentNo ?? ""} onChange={set("studentNo")} required placeholder="SC2025-001" />
                <Field label="Copy ID" value={form.copyId ?? ""} onChange={set("copyId")} required placeholder="UUID of an AVAILABLE copy" />
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
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
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
