"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, History } from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StatCard } from "@/components/layout/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentHistory } from "@/components/fees/payment-history";
import { useApi } from "@/hooks/use-api";
import { feeStatusClass, formatCurrency, formatDate } from "@/lib/format";
import type { FeeRecord, FeesSummary } from "@/lib/types";

function FeesContent() {
  const { data, loading, error, reload } = useApi<FeesSummary>("/students/me/fees-summary");
  const [historyFee, setHistoryFee] = useState<FeeRecord | null>(null);

  return (
    <PageContainer
      title="Fees"
      description="Your fee dues, instalments and payment status"
    >
      {loading ? (
        <LoadingState label="Loading fee details..." />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-4">
          {data?.nextDue && (
            <Alert>
              <CalendarClock className="h-4 w-4" />
              <AlertTitle>Payment due on {formatDate(data.nextDue.dueDate)}</AlertTitle>
              <AlertDescription>
                {data.nextDue.feeType} · {formatCurrency(data.nextDue.amount)} outstanding.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total fees" value={formatCurrency(data?.totalFees ?? 0)} hint="All fee heads this semester" />
            <StatCard title="Paid" value={formatCurrency(data?.totalPaid ?? 0)} hint="Amount already recorded" />
            <StatCard
              title="Pending"
              value={formatCurrency(data?.totalPending ?? 0)}
              hint={data?.totalPending ? "Outstanding balance" : "Nothing due"}
            />
            <StatCard
              title="Next due"
              value={data?.nextDue ? formatCurrency(data.nextDue.amount) : "—"}
              hint={data?.nextDue ? `Due ${formatDate(data.nextDue.dueDate)}` : "No upcoming payment"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Fee records</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.records.length ?? 0) === 0 ? (
                <EmptyState
                  title="No fee records yet"
                  description="Fee heads will appear here once they are generated for your semester."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee head</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">History</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.feeType}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.amountPaid)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.balance)}</TableCell>
                          <TableCell>{formatDate(record.dueDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={feeStatusClass[record.status]}>
                              {record.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHistoryFee(record)}
                              aria-label={`Payment history for ${record.feeType}`}
                            >
                              <History className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Payments are recorded by the college office after they are received. Contact the accounts
              desk for receipts or corrections — online payment is not enabled yet.
            </p>
          </div>

          <Dialog open={historyFee !== null} onOpenChange={(open) => !open && setHistoryFee(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              {historyFee && (
                <>
                  <DialogHeader>
                    <DialogTitle>Payment history</DialogTitle>
                    <DialogDescription>
                      {historyFee.feeType} · {formatCurrency(historyFee.amountPaid)} of{" "}
                      {formatCurrency(historyFee.amount)} paid
                    </DialogDescription>
                  </DialogHeader>
                  <PaymentHistory feeId={historyFee.id} />
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </PageContainer>
  );
}

export default function FeesPage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <FeesContent />
    </RoleGuard>
  );
}
