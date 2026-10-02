import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import type { Role } from "../../utils/roles";
import type { ListFeesQuery, RecordPaymentInput } from "./fees.schemas";
import {
  AdminFeeRecord,
  FeePayment,
  FeePaymentsView,
  FeeStatus,
  FeesList,
  FeesSummaryAdmin,
  PaymentResult,
  feeStatus,
  round2,
} from "./fees.types";

export interface ActingUser {
  id: string;
  role: Role;
}

interface FeeRow {
  id: string;
  fee_type: string;
  amount: number;
  amount_paid: number;
  due_date: Date;
  status: string;
  payment_count?: number;
  student_id: string;
  owner_user_id: string;
  student_no: string;
  student_name: string;
  student_email: string;
  section: string;
  semester: number;
}

function toAdminRecord(row: FeeRow): AdminFeeRecord {
  const amount = Number(row.amount);
  const amountPaid = Number(row.amount_paid);
  return {
    id: row.id,
    feeType: row.fee_type,
    amount,
    amountPaid,
    balance: round2(Math.max(0, amount - amountPaid)),
    dueDate: toLocalDateString(row.due_date),
    status: feeStatus(amount, amountPaid) as FeeStatus,
    paymentCount: row.payment_count ?? 0,
    student: {
      id: row.student_id,
      studentNo: row.student_no,
      name: row.student_name,
      email: row.student_email,
      section: row.section,
      semester: row.semester,
    },
  };
}

function toPayment(
  row: { id: string; fee_id: string; amount: number; payment_method: string; reference: string | null; recorded_by: string | null; created_at: Date; recorded_by_name: string | null },
): FeePayment {
  return {
    id: row.id,
    feeId: row.fee_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method as FeePayment["paymentMethod"],
    reference: row.reference,
    recordedBy: row.recorded_by ? { id: row.recorded_by, name: row.recorded_by_name ?? "Unknown" } : null,
    createdAt: row.created_at.toISOString(),
  };
}

const FEE_SELECT = `
  SELECT f.id, f.fee_type, f.amount, f.amount_paid, f.due_date, f.status,
         s.id AS student_id, s.user_id AS owner_user_id, s.student_no, s.section, s.semester,
         u.name AS student_name, u.email AS student_email,
         (SELECT count(*)::int FROM fee_payments p WHERE p.fee_id = f.id) AS payment_count
    FROM fees f
    JOIN students s ON s.id = f.student_id
    JOIN users u ON u.id = s.user_id
`;

/** Admin fee register: searchable list plus institute-wide totals. */
export async function listFees(filters: ListFeesQuery): Promise<FeesList> {
  const search = filters.q ?? "";
  const status = filters.status ?? "";

  const [records, summaryRows] = await Promise.all([
    query<FeeRow>(
      `${FEE_SELECT}
        WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%'
                   OR s.student_no ILIKE '%' || $1 || '%'
                   OR u.email ILIKE '%' || $1 || '%')
          AND ($2 = '' OR f.status = $2)
        ORDER BY (f.amount_paid < f.amount) DESC, f.due_date ASC, u.name ASC
        LIMIT 500`,
      [search, status],
    ),
    queryOne<{
      fee_count: number;
      total_amount: number;
      total_paid: number;
      open_fee_count: number;
      students_with_dues: number;
    }>(
      `SELECT count(*)::int AS fee_count,
              COALESCE(sum(amount), 0)        AS total_amount,
              COALESCE(sum(amount_paid), 0)   AS total_paid,
              count(*) FILTER (WHERE amount_paid < amount)::int AS open_fee_count,
              count(DISTINCT student_id) FILTER (WHERE amount_paid < amount)::int AS students_with_dues
         FROM fees`,
    ),
  ]);

  const totalAmount = Number(summaryRows?.total_amount ?? 0);
  const totalPaid = Number(summaryRows?.total_paid ?? 0);

  const summary: FeesSummaryAdmin = {
    feeCount: summaryRows?.fee_count ?? 0,
    totalAmount: round2(totalAmount),
    totalPaid: round2(totalPaid),
    totalOutstanding: round2(Math.max(0, totalAmount - totalPaid)),
    openFeeCount: summaryRows?.open_fee_count ?? 0,
    studentsWithDues: summaryRows?.students_with_dues ?? 0,
  };

  return { summary, records: records.map(toAdminRecord) };
}

/**
 * Records a payment and updates the fee balance in one transaction.
 * The fee row is locked (FOR UPDATE) so concurrent payments cannot overdraw it.
 */
export async function recordPayment(
  user: ActingUser,
  feeId: string,
  input: RecordPaymentInput,
): Promise<PaymentResult> {
  return withTransaction(async (client) => {
    const result = await client.query<FeeRow>(
      `SELECT f.id, f.fee_type, f.amount, f.amount_paid, f.due_date, f.status,
              s.id AS student_id, s.student_no, s.section, s.semester,
              u.name AS student_name, u.email AS student_email
         FROM fees f
         JOIN students s ON s.id = f.student_id
         JOIN users u ON u.id = s.user_id
        WHERE f.id = $1
        FOR UPDATE OF f`,
      [feeId],
    );

    const fee = result.rows[0];
    if (!fee) {
      throw ApiError.notFound("Fee record not found");
    }

    const total = Number(fee.amount);
    const paid = Number(fee.amount_paid);
    const balance = round2(total - paid);
    const amount = round2(input.amount);

    if (amount <= 0) {
      throw ApiError.badRequest("Payment amount must be greater than zero", "INVALID_AMOUNT");
    }
    if (amount > balance) {
      throw ApiError.badRequest(
        `Payment exceeds the outstanding balance of ${balance}`,
        "OVERPAYMENT",
        { outstandingBalance: balance },
      );
    }

    const paymentResult = await client.query<{
      id: string;
      fee_id: string;
      amount: number;
      payment_method: string;
      reference: string | null;
      recorded_by: string | null;
      created_at: Date;
      recorded_by_name: string | null;
    }>(
      `INSERT INTO fee_payments (fee_id, amount, payment_method, reference, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, fee_id, amount, payment_method, reference, recorded_by, created_at,
                 (SELECT name FROM users WHERE id = $5) AS recorded_by_name`,
      [feeId, amount, input.paymentMethod, input.reference ?? null, user.id],
    );

    const newPaid = round2(paid + amount);
    const nextStatus = feeStatus(total, newPaid);

    await client.query("UPDATE fees SET amount_paid = $1, status = $2 WHERE id = $3", [
      newPaid,
      nextStatus,
      feeId,
    ]);

    const countResult = await client.query<{ payment_count: number }>(
      "SELECT count(*)::int AS payment_count FROM fee_payments WHERE fee_id = $1",
      [feeId],
    );

    return {
      payment: toPayment(paymentResult.rows[0]),
      fee: toAdminRecord({
        ...fee,
        amount_paid: newPaid,
        status: nextStatus,
        payment_count: countResult.rows[0].payment_count,
      }),
    };
  });
}

/** Payment history. Students may only read their own fee records (IDOR-safe). */
export async function getPayments(user: ActingUser, feeId: string): Promise<FeePaymentsView> {
  const fee = await queryOne<FeeRow>(`${FEE_SELECT} WHERE f.id = $1`, [feeId]);
  if (!fee) {
    throw ApiError.notFound("Fee record not found");
  }

  if (user.role === "FACULTY") {
    throw ApiError.forbidden("Faculty accounts cannot view fee records");
  }
  if (user.role === "STUDENT" && fee.owner_user_id !== user.id) {
    // Do not leak the existence of another student's fee record.
    throw ApiError.notFound("Fee record not found");
  }

  const payments = await query<{
    id: string;
    fee_id: string;
    amount: number;
    payment_method: string;
    reference: string | null;
    recorded_by: string | null;
    created_at: Date;
    recorded_by_name: string | null;
  }>(
    `SELECT p.id, p.fee_id, p.amount, p.payment_method, p.reference, p.recorded_by, p.created_at,
            u.name AS recorded_by_name
       FROM fee_payments p
       LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.fee_id = $1
      ORDER BY p.created_at DESC, p.id DESC`,
    [feeId],
  );

  const amount = Number(fee.amount);
  const amountPaid = Number(fee.amount_paid);

  return {
    fee: {
      id: fee.id,
      feeType: fee.fee_type,
      amount,
      amountPaid,
      balance: round2(Math.max(0, amount - amountPaid)),
      dueDate: toLocalDateString(fee.due_date),
      status: feeStatus(amount, amountPaid),
      student: {
        id: fee.student_id,
        studentNo: fee.student_no,
        name: fee.student_name,
        email: fee.student_email,
      },
    },
    payments: payments.map(toPayment),
  };
}
