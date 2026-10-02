"use client";

import { useState } from "react";
import { Banknote, Search, Wallet } from "lucide-react";
import { RecordPaymentDialog } from "@/components/fees/record-payment-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { feeStatusClass, formatCurrency, formatDate } from "@/lib/format";
import { StatCard } from "@/components/layout/stat-card";
import type { AdminFeeRecord, FeesList } from "@/lib/types";

const STATUS_OPTIONS = ["ALL", "PENDING", "PARTIAL", "PAID"] as const;

export function FeeManagement() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const [selectedFee, setSelectedFee] = useState<AdminFeeRecord | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status !== "ALL") params.set("status", status);
  const query = params.toString();

  const { data, loading, error, reload } = useApi<FeesList>(query ? `/fees?${query}` : "/fees");
  const records = data?.records ?? [];
  const summary = data?.summary;

  const updateFee = (updated: AdminFeeRecord) => {
    setSelectedFee(updated);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Collected"
          value={formatCurrency(summary?.totalPaid ?? 0)}
          hint={`of ${formatCurrency(summary?.totalAmount ?? 0)} billed`}
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard
          title="Outstanding"
          value={formatCurrency(summary?.totalOutstanding ?? 0)}
          hint={`${summary?.openFeeCount ?? 0} fee heads open`}
          icon={<Wallet className="h-4 w-4" />}
          footer={
            (summary?.totalOutstanding ?? 0) > 0 ? (
              <span className="text-amber-600">Collection pending</span>
            ) : (
              <span className="text-emerald-600">All dues cleared</span>
            )
          }
        />
        <StatCard
          title="Students with dues"
          value={summary?.studentsWithDues ?? 0}
          hint="Across the whole institute"
        />
        <StatCard
          title="Fee records"
          value={summary?.feeCount ?? 0}
          hint="Semester fee heads generated"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Fee register</CardTitle>
          <Badge variant="secondary">Admin only</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="fee-search">Search student</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fee-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Name, student number or email"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number])}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "ALL" ? "All statuses" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                Search
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatus("ALL");
                }}
              >
                Clear
              </Button>
            </div>
          </form>

          {loading ? (
            <LoadingState label="Loading fee records..." />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : records.length === 0 ? (
            <EmptyState
              title="No matching fee records"
              description="Adjust the search or status filter and try again."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Fee head</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="font-medium">{record.student.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {record.student.studentNo} · Section {record.student.section}
                        </div>
                      </TableCell>
                      <TableCell>{record.feeType}</TableCell>
                      <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(record.amountPaid)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(record.balance)}
                      </TableCell>
                      <TableCell>{formatDate(record.dueDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={feeStatusClass[record.status]}>
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedFee(record)}>
                          {record.balance > 0 ? "Record payment" : "View history"}
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

      <RecordPaymentDialog
        fee={selectedFee}
        onClose={() => setSelectedFee(null)}
        onRecorded={updateFee}
      />
    </div>
  );
}
