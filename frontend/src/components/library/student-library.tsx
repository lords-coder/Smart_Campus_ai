"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/components/providers/auth-provider";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { formatCurrency } from "@/lib/format";
import type { BookDetail, BookListItem, LibraryFineSummary, LibraryReservation, Loan } from "@/lib/types";

interface PagedBooks {
  items: BookListItem[];
  total: number;
  page: number;
  limit: number;
}

export function StudentLibrary() {
  const { user } = useAuth();
  const readOnly = user?.role !== "STUDENT";
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  const params = [
    appliedQuery ? `q=${encodeURIComponent(appliedQuery)}` : "",
    category ? `category=${encodeURIComponent(category)}` : "",
    availableOnly ? "available=true" : "",
    `page=${page}&limit=12`,
  ].filter(Boolean).join("&");

  const catalogue = useApi<PagedBooks>(`/library/books?${params}`);
  const loans = useApi<{ loans: Loan[] }>(readOnly ? null : "/library/my-loans");
  const reservations = useApi<{ reservations: LibraryReservation[] }>(readOnly ? null : "/library/my-reservations");
  const fines = useApi<LibraryFineSummary>(readOnly ? null : "/library/my-fines");

  const reloadAll = () => {
    catalogue.reload();
    loans.reload();
    reservations.reload();
    fines.reload();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search catalogue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="border rounded px-2 py-1.5 text-sm flex-1 min-w-40"
              placeholder="Title, author, or ISBN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedQuery(query);
                  setPage(1);
                }
              }}
              aria-label="Search books"
            />
            <input
              className="border rounded px-2 py-1.5 text-sm"
              placeholder="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  catalogue.reload();
                }
              }}
              aria-label="Filter by category"
            />
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => {
                  setAvailableOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Available only
            </label>
            <Button
              size="sm"
              onClick={() => {
                setAppliedQuery(query);
                setPage(1);
                catalogue.reload();
              }}
            >
              Search
            </Button>
          </div>

          {catalogue.error ? (
            <ErrorState message={catalogue.error} onRetry={catalogue.reload} />
          ) : catalogue.loading ? (
            <LoadingState label="Searching catalogue..." />
          ) : (catalogue.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No books match your search.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {catalogue.data?.total} result(s) · page {catalogue.data?.page}
              </p>
              <ul className="grid gap-3 md:grid-cols-2">
                {(catalogue.data?.items ?? []).map((book) => (
                  <li key={book.id}>
                    <button
                      onClick={() => setSelectedBook(book.id)}
                      className="w-full rounded-lg border p-3 text-left hover:border-primary/40"
                    >
                      <p className="text-sm font-medium">{book.title}</p>
                      <p className="text-xs text-muted-foreground">{book.author} · {book.category}</p>
                      <p className="mt-1 text-xs">
                        {book.availableCopies > 0 ? (
                          <span className="text-emerald-700">{book.availableCopies} of {book.totalCopies} available</span>
                        ) : (
                          <span className="text-amber-700">All {book.totalCopies} copies out</span>
                        )}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(catalogue.data?.items.length ?? 0) < 12}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedBook && (
        <BookDetailPanel bookId={selectedBook} readOnly={readOnly} onClose={() => setSelectedBook(null)} onChanged={reloadAll} />
      )}

      {!readOnly && (
        <>
          <MyLoans loans={loans} onChanged={reloadAll} />
          <div className="grid gap-4 lg:grid-cols-2">
            <MyReservations reservations={reservations} onChanged={reloadAll} />
            <MyFines fines={fines} />
          </div>
        </>
      )}
    </div>
  );
}

function BookDetailPanel({
  bookId,
  readOnly,
  onClose,
  onChanged,
}: {
  bookId: string;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useApi<BookDetail>(`/library/books/${bookId}`);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);

  async function reserve() {
    setSaving(true);
    setActionError(null);
    try {
      await api(`/library/books/${bookId}/reserve`, { method: "POST" });
      setReserved(true);
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{loading ? "Loading book..." : data?.title}</CardTitle>
        <button className="text-sm text-muted-foreground hover:underline" onClick={onClose}>Close</button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingState label="Loading book details..." />
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{data.author} · {data.publisher} {data.publicationYear ? `· ${data.publicationYear}` : ""}</p>
            <p><span className="text-muted-foreground">ISBN:</span> {data.isbn} · <span className="text-muted-foreground">Edition:</span> {data.edition || "—"} · <span className="text-muted-foreground">Category:</span> {data.category}</p>
            {data.description && <p className="text-muted-foreground">{data.description}</p>}
            <p>
              <Badge variant="outline">
                {data.availableCopies} of {data.totalCopies} copies available
              </Badge>
            </p>
            {!readOnly && (
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={reserve} disabled={saving || reserved}>
                  {reserved ? "Reserved" : saving ? "Reserving..." : "Reserve this book"}
                </Button>
                {actionError && <span className="text-xs text-red-600">{actionError}</span>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MyLoans({
  loans,
  onChanged,
}: {
  loans: { data: { loans: Loan[] } | null; loading: boolean; error: string | null; reload: () => void };
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function renew(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/library/loans/${id}/renew`, { method: "POST" });
      onChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (loans.error) return <ErrorState message={loans.error} onRetry={loans.reload} />;
  if (loans.loading) return <LoadingState label="Loading loans..." />;
  const items = loans.data?.loans ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>My borrowed books ({items.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {actionError && <p className="text-sm text-red-600 mb-2">{actionError}</p>}
        {items.length === 0 ? (
          <EmptyState
            title="No borrowed books"
            description="Search the catalogue above and ask the library desk for issuance, or reserve a title."
            icon={<BookOpen className="h-6 w-6" />}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((loan) => (
              <li key={loan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{loan.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {loan.dueAt} · renewed {loan.renewedCount}x
                    {loan.overdue && <span className="text-red-700"> · overdue {loan.overdueDays}d (fine {formatCurrency(loan.currentFine)})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {loan.overdue ? (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">OVERDUE</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">ACTIVE</Badge>
                  )}
                  <button
                    className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                    disabled={busy === loan.id}
                    onClick={() => renew(loan.id)}
                  >
                    {busy === loan.id ? "Renewing..." : "Renew"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MyReservations({
  reservations,
  onChanged,
}: {
  reservations: { data: { reservations: LibraryReservation[] } | null; loading: boolean; error: string | null; reload: () => void };
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await api(`/library/reservations/${id}/cancel`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  if (reservations.error) return <ErrorState message={reservations.error} onRetry={reservations.reload} />;
  if (reservations.loading) return <LoadingState label="Loading reservations..." />;
  const items = (reservations.data?.reservations ?? []).filter((r) => r.status === "WAITING" || r.status === "READY");
  return (
    <Card>
      <CardHeader>
        <CardTitle>My reservations ({items.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active reservations.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{r.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.status}{r.queuePosition ? ` · position ${r.queuePosition} in queue` : ""} · requested {r.requestedAt.slice(0, 10)}
                  </p>
                </div>
                <button
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  disabled={busy === r.id}
                  onClick={() => cancel(r.id)}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MyFines({
  fines,
}: {
  fines: { data: import("@/lib/types").LibraryFineSummary | null; loading: boolean; error: string | null; reload: () => void };
}) {
  if (fines.error) return <ErrorState message={fines.error} onRetry={fines.reload} />;
  if (fines.loading) return <LoadingState label="Loading fines..." />;
  const data = fines.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fine summary</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{formatCurrency(data?.totalBalance ?? 0)}</p>
        <p className="text-xs text-muted-foreground mb-3">Outstanding library fine balance. Pay at the institute office.</p>
        {(data?.ledger.length ?? 0) === 0 && (data?.accruing.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No fines. Return books on time to keep it that way.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.ledger ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-2">
                <div>
                  <p className="font-medium">{f.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(f.amountPaid)} paid of {formatCurrency(f.amount)}</p>
                </div>
                <Badge variant="outline">{f.status}</Badge>
              </li>
            ))}
            {(data?.accruing ?? []).map((a) => (
              <li key={a.loanId} className="flex items-center justify-between gap-2 text-sm rounded-lg border border-dashed p-2">
                <div>
                  <p className="font-medium">{a.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">Overdue {a.overdueDays}d — accrues on return</p>
                </div>
                <span className="text-sm font-medium">{formatCurrency(a.currentFine)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
