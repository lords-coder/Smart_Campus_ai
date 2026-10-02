"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentHistory } from "@/components/fees/payment-history";
import { api, apiErrorMessage } from "@/lib/api";
import { feeStatusClass, formatCurrency, formatDate, paymentMethodLabel } from "@/lib/format";
import type { AdminFeeRecord, PaymentMethod, PaymentResult } from "@/lib/types";

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "UPI", "CARD"];

interface RecordPaymentDialogProps {
  fee: AdminFeeRecord | null;
  onClose: () => void;
  onRecorded: (fee: AdminFeeRecord) => void;
}

export function RecordPaymentDialog({ fee, onClose, onRecorded }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Reset the form whenever a different fee is opened (render-phase adjustment).
  const feeId = fee?.id ?? null;
  const [lastFeeId, setLastFeeId] = useState<string | null>(null);
  if (feeId !== lastFeeId) {
    setLastFeeId(feeId);
    setAmount(fee ? fee.balance.toFixed(2) : "");
    setMethod("CASH");
    setReference("");
    setFormError(null);
    setHistoryVersion((version) => version + 1);
  }

  const submit = async () => {
    if (!fee) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (value > fee.balance) {
      setFormError(`Amount exceeds the outstanding balance of ${formatCurrency(fee.balance)}.`);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const result = await api<PaymentResult>(`/fees/${fee.id}/payments`, {
        method: "POST",
        body: {
          amount: value,
          paymentMethod: method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      });
      toast.success(`Payment of ${formatCurrency(result.payment.amount)} recorded`, {
        description: `${result.fee.student.name} · ${result.fee.feeType} · now ${result.fee.status}`,
      });
      setHistoryVersion((version) => version + 1);
      onRecorded(result.fee);
      setAmount(result.fee.balance.toFixed(2));
      setReference("");
    } catch (error) {
      const message = apiErrorMessage(error);
      setFormError(message);
      toast.error("Payment was not recorded", { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={fee !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {fee && (
          <>
            <DialogHeader>
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription>
                {fee.student.name} · {fee.student.studentNo} · {fee.feeType}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-medium">{formatCurrency(fee.amount)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-medium">{formatCurrency(fee.amountPaid)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="font-medium">{formatCurrency(fee.balance)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline" className={`mt-1 ${feeStatusClass[fee.status]}`}>
                  {fee.status}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Due {formatDate(fee.dueDate)} · Section {fee.student.section} ·{" "}
              {fee.student.email}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Amount received</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Outstanding {formatCurrency(fee.balance)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {paymentMethodLabel[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="payment-reference">Reference (optional)</Label>
                <Input
                  id="payment-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={100}
                  placeholder="Transaction ID, receipt number, cheque no."
                />
              </div>
            </div>

            {formError && <ErrorState title="Payment failed" message={formError} />}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Close
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Recording..." : "Record payment"}
              </Button>
            </DialogFooter>

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Payment history</p>
              <PaymentHistory key={`${fee.id}-${historyVersion}`} feeId={fee.id} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
