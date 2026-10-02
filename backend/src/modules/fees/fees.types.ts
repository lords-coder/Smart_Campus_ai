export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type FeeStatus = "PENDING" | "PARTIAL" | "PAID";

export interface FeePayment {
  id: string;
  feeId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  recordedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface AdminFeeRecord {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: FeeStatus;
  paymentCount: number;
  student: {
    id: string;
    studentNo: string;
    name: string;
    email: string;
    section: string;
    semester: number;
  };
}

export interface FeesSummaryAdmin {
  feeCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  openFeeCount: number;
  studentsWithDues: number;
}

export interface FeesList {
  summary: FeesSummaryAdmin;
  records: AdminFeeRecord[];
}

export interface FeePaymentsView {
  fee: {
    id: string;
    feeType: string;
    amount: number;
    amountPaid: number;
    balance: number;
    dueDate: string;
    status: FeeStatus;
    student: { id: string; studentNo: string; name: string; email: string } | null;
  };
  payments: FeePayment[];
}

export interface PaymentResult {
  payment: FeePayment;
  fee: AdminFeeRecord;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function feeStatus(amount: number, amountPaid: number): FeeStatus {
  if (amountPaid >= amount) return "PAID";
  if (amountPaid > 0) return "PARTIAL";
  return "PENDING";
}
