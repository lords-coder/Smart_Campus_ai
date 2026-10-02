"use client";

import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime, paymentMethodLabel } from "@/lib/format";
import { useApi } from "@/hooks/use-api";
import type { FeePayment, FeePaymentsView } from "@/lib/types";

interface PaymentHistoryProps {
  feeId: string;
  emptyHint?: string;
}

/**
 * Payment history for a single fee. Remount (via `key`) after recording a
 * payment so the list refetches without extra state plumbing.
 */
export function PaymentHistory({ feeId, emptyHint }: PaymentHistoryProps) {
  const { data, loading, error, reload } = useApi<FeePaymentsView>(`/fees/${feeId}/payments`);

  if (loading) return <LoadingState label="Loading payment history..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const payments: FeePayment[] = data?.payments ?? [];

  if (payments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {emptyHint ?? "No payments have been recorded for this fee yet."}
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {payments.map((payment) => (
        <li key={payment.id} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="font-medium">{formatCurrency(payment.amount)}</p>
            <p className="text-xs text-muted-foreground">
              {paymentMethodLabel[payment.paymentMethod] ?? payment.paymentMethod}
              {payment.reference ? ` · ${payment.reference}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Recorded by {payment.recordedBy?.name ?? "System"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Badge variant="outline">{formatDate(payment.createdAt.slice(0, 10))}</Badge>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(payment.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
