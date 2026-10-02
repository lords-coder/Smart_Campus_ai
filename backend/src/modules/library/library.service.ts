import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toDateString, toLocalDateString } from "../../utils/date";
import type {
  BookCopy,
  BookDetail,
  BookListItem,
  Loan,
  Paged,
  Reservation,
} from "./library.types";

// ------------------------------------------------------- central config
// All library policy numbers live here — never scattered across the codebase.

/** Fine per overdue day, in rupees. */
export const LIBRARY_FINE_PER_DAY = 10;
/** Maximum fine assessed on a single loan, in rupees. */
export const LIBRARY_MAX_FINE = 500;
/** Default loan length in days. */
export const LIBRARY_LOAN_DAYS = 14;
/** Maximum simultaneously active loans per student. */
export const LIBRARY_MAX_ACTIVE_LOANS = 4;
/** Maximum renewals allowed on a single loan. */
export const LIBRARY_MAX_RENEWALS = 2;
/** Maximum live (WAITING/READY) reservations per student. */
export const LIBRARY_MAX_ACTIVE_RESERVATIONS = 3;

type TxClient = PoolClient;

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

async function profileIdByNo(studentNo: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE student_no = $1", [studentNo.trim()]);
  if (!row) throw ApiError.notFound("Student not found");
  return row.id;
}

function pgConflict(error: unknown, message: string): ApiError {
  if ((error as { code?: string })?.code === "23505") return ApiError.conflict(message, "DUPLICATE_RESOURCE");
  throw error;
}

/**
 * Calendar days a loan is overdue as of *today in the application timezone*.
 *
 * Overdue/fine math must use one basis everywhere. node-pg reads DATE columns
 * as local midnight, the seed writes local dates, and the UI renders local
 * dates — so the app computes this in JS rather than via `CURRENT_DATE`, which
 * follows the database session timezone and can disagree by a day.
 */
function overdueDaysSince(dueAt: unknown): number {
  const due = dueAt instanceof Date ? new Date(dueAt.getTime()) : new Date(String(dueAt));
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

/** Today as `YYYY-MM-DD` in local time — the SQL twin of {@link overdueDaysSince}. */
function todayLocalDate(): string {
  return toDateString();
}

function loanOverdue(row: { due_at: unknown; status: unknown }): { overdue: boolean; overdueDays: number } {
  if (row.status !== "ACTIVE") return { overdue: false, overdueDays: 0 };
  const overdueDays = overdueDaysSince(row.due_at);
  return { overdue: overdueDays > 0, overdueDays };
}

export function fineForOverdueDays(days: number): number {
  if (days <= 0) return 0;
  return Math.min(days * LIBRARY_FINE_PER_DAY, LIBRARY_MAX_FINE);
}

// ---------------------------------------------------------------- catalogue

export async function listBooks(filter: {
  q?: string;
  category?: string;
  author?: string;
  available?: boolean;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<Paged<BookListItem>> {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.activeOnly !== false) conditions.push(`b.active = true`);
  if (filter.q) {
    conditions.push(
      `(b.title ILIKE $${params.length + 1} OR b.author ILIKE $${params.length + 1} OR b.isbn ILIKE $${params.length + 1})`,
    );
    params.push(`%${filter.q}%`);
  }
  if (filter.category) {
    conditions.push(`lower(b.category) = lower($${params.length + 1})`);
    params.push(filter.category);
  }
  if (filter.author) {
    conditions.push(`b.author ILIKE $${params.length + 1}`);
    params.push(`%${filter.author}%`);
  }
  const havingAvailable = filter.available === true;
  const rows = await query(
    `SELECT b.id, b.title, b.subtitle, b.isbn, b.author, b.publisher, b.category,
            b.edition, b.publication_year, b.active,
            COUNT(c.id)::int AS total_copies,
            COUNT(c.id) FILTER (WHERE c.status = 'AVAILABLE')::int AS available_copies,
            COUNT(*) OVER()::int AS full_count
     FROM books b
     LEFT JOIN book_copies c ON c.book_id = b.id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     GROUP BY b.id
     ${havingAvailable ? `HAVING COUNT(c.id) FILTER (WHERE c.status = 'AVAILABLE') > 0` : ""}
     ORDER BY b.title ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  return {
    items: rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      subtitle: (row.subtitle as string) ?? "",
      isbn: row.isbn as string,
      author: row.author as string,
      publisher: (row.publisher as string) ?? "",
      category: row.category as string,
      edition: (row.edition as string) ?? "",
      publicationYear: row.publication_year === null ? null : Number(row.publication_year),
      active: Boolean(row.active),
      totalCopies: Number(row.total_copies),
      availableCopies: Number(row.available_copies),
    })),
    total,
    page,
    limit,
  };
}

export async function getBook(id: string, activeOnly = true): Promise<BookDetail> {
  const rows = await query(
    `SELECT b.*, COUNT(c.id)::int AS total_copies,
            COUNT(c.id) FILTER (WHERE c.status = 'AVAILABLE')::int AS available_copies
     FROM books b LEFT JOIN book_copies c ON c.book_id = b.id
     WHERE b.id = $1 ${activeOnly ? "AND b.active = true" : ""} GROUP BY b.id`,
    [id],
  );
  if (rows.length === 0) throw ApiError.notFound("Book not found");
  const row = rows[0];
  const copies = await query(
    `SELECT id, accession_number, location, status FROM book_copies WHERE book_id = $1 ORDER BY accession_number ASC`,
    [id],
  );
  return {
    id: row.id as string,
    title: row.title as string,
    subtitle: (row.subtitle as string) ?? "",
    isbn: row.isbn as string,
    author: row.author as string,
    publisher: (row.publisher as string) ?? "",
    category: row.category as string,
    edition: (row.edition as string) ?? "",
    description: (row.description as string) ?? "",
    publicationYear: row.publication_year === null ? null : Number(row.publication_year),
    active: Boolean(row.active),
    totalCopies: Number(row.total_copies),
    availableCopies: Number(row.available_copies),
    copies: copies.map((c) => ({
      id: c.id as string,
      accessionNumber: c.accession_number as string,
      location: c.location as string,
      status: c.status as string,
    })),
  };
}

export async function createBook(input: {
  title: string;
  subtitle?: string;
  isbn: string;
  author?: string;
  publisher?: string;
  category?: string;
  edition?: string;
  description?: string;
  publicationYear?: number | null;
}) {
  try {
    const rows = await query(
      `INSERT INTO books (title, subtitle, isbn, author, publisher, category, edition, description, publication_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        input.title.trim(),
        input.subtitle?.trim() ?? "",
        input.isbn.trim(),
        input.author?.trim() || "Unknown",
        input.publisher?.trim() ?? "",
        input.category?.trim() || "General",
        input.edition?.trim() ?? "",
        input.description?.trim() ?? "",
        input.publicationYear ?? null,
      ],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A book with this ISBN already exists");
  }
}

export async function updateBook(id: string, updates: Record<string, unknown>) {
  const allowed = ["title", "subtitle", "author", "publisher", "category", "edition", "description", "publication_year", "active"] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(typeof updates[key] === "string" ? (updates[key] as string).trim() : updates[key]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE books SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Book not found");
  return rows[0];
}

// ------------------------------------------------------------------- copies

export async function listCopies(bookId?: string): Promise<BookCopy[]> {
  const rows = await query(
    `SELECT c.*, b.title AS book_title FROM book_copies c JOIN books b ON b.id = c.book_id
     ${bookId ? `WHERE c.book_id = $1` : ""} ORDER BY c.accession_number ASC LIMIT 500`,
    bookId ? [bookId] : [],
  );
  return rows.map((row) => ({
    id: row.id as string,
    bookId: row.book_id as string,
    bookTitle: row.book_title as string,
    accessionNumber: row.accession_number as string,
    location: row.location as string,
    status: row.status as BookCopy["status"],
  }));
}

export async function createCopy(bookId: string, accessionNumber: string, location: string) {
  const book = await queryOne<{ id: string }>(`SELECT id FROM books WHERE id = $1`, [bookId]);
  if (!book) throw ApiError.notFound("Book not found");
  try {
    const rows = await query(
      `INSERT INTO book_copies (book_id, accession_number, location) VALUES ($1, $2, $3) RETURNING *`,
      [bookId, accessionNumber.trim().toUpperCase(), location.trim() || "Main Stacks"],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A copy with this accession number already exists");
  }
}

export async function updateCopy(id: string, updates: { status?: string; location?: string }) {
  if (updates.status === "ISSUED") {
    throw ApiError.badRequest("Copies become ISSUED only through the issue workflow", "VALIDATION_ERROR");
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.status !== undefined) {
    sets.push(`status = $${params.length + 1}`);
    params.push(updates.status);
  }
  if (updates.location !== undefined) {
    sets.push(`location = $${params.length + 1}`);
    params.push(updates.location.trim());
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE book_copies SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Copy not found");
  return rows[0];
}

// -------------------------------------------------------------------- loans

function mapLoan(row: Record<string, unknown>): Loan {
  const { overdue, overdueDays } = loanOverdue({ due_at: row.due_at, status: row.status });
  return {
    id: row.id as string,
    copyId: row.copy_id as string,
    accessionNumber: row.accession_number as string | undefined,
    bookId: row.book_id as string,
    bookTitle: row.book_title as string,
    bookAuthor: (row.book_author as string) ?? "",
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    issuedAt: new Date(row.issued_at as string).toISOString(),
    dueAt: toLocalDateString(row.due_at as string),
    returnedAt: row.returned_at ? new Date(row.returned_at as string).toISOString() : null,
    renewedCount: Number(row.renewed_count),
    status: row.status as Loan["status"],
    overdue,
    overdueDays,
    currentFine: fineForOverdueDays(overdueDays),
  };
}

const LOAN_SELECT = `
  SELECT l.*, b.id AS book_id, b.title AS book_title, b.author AS book_author,
         c.accession_number, st.student_no, u.name AS student_name
  FROM library_loans l
  JOIN book_copies c ON c.id = l.copy_id
  JOIN books b ON b.id = c.book_id
  JOIN students st ON st.id = l.student_id
  JOIN users u ON u.id = st.user_id
`;

export async function getMyLoans(userId: string, status?: string): Promise<Loan[]> {
  const profileId = await requireStudentProfile(userId);
  return listLoans({ studentId: profileId, status });
}

export async function listLoans(filter: { studentId?: string; status?: string; page?: number; limit?: number } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.studentId) {
    conditions.push(`l.student_id = $${params.length + 1}`);
    params.push(filter.studentId);
  }
  if (filter.status === "OVERDUE") {
    conditions.push(`l.status = 'ACTIVE' AND l.due_at < $${params.length + 1}::date`);
    params.push(todayLocalDate());
  } else if (filter.status) {
    conditions.push(`l.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const rows = await query(
    `${LOAN_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY l.issued_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  return rows.map(mapLoan);
}

export async function overdueLoans(page = 1, limit = 20): Promise<Paged<Loan>> {
  const count = await query(
    `SELECT count(*)::int AS n FROM library_loans l WHERE l.status = 'ACTIVE' AND l.due_at < $1::date`,
    [todayLocalDate()],
  );
  const items = await listLoans({ status: "OVERDUE", page, limit });
  return { items, total: Number(count[0]?.n ?? 0), page, limit };
}

async function activeLoanCount(client: TxClient, profileId: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS n FROM library_loans WHERE student_id = $1 AND status = 'ACTIVE'`, [
    profileId,
  ]);
  return Number(result.rows[0]?.n ?? 0);
}

async function firstWaiter(client: TxClient, bookId: string): Promise<Record<string, unknown> | null> {
  const result = await client.query(
    `SELECT * FROM library_reservations WHERE book_id = $1 AND status = 'WAITING' ORDER BY requested_at ASC LIMIT 1`,
    [bookId],
  );
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

export async function issueBook(issuerId: string, studentNo: string, copyId: string, loanDays = LIBRARY_LOAN_DAYS) {
  return withTransaction(async (client) => {
    const copyRows = await client.query(
      `SELECT c.*, b.id AS book_id, b.active AS book_active FROM book_copies c
       JOIN books b ON b.id = c.book_id WHERE c.id = $1 FOR UPDATE`,
      [copyId],
    );
    if (copyRows.rows.length === 0) throw ApiError.notFound("Copy not found");
    const copy = copyRows.rows[0];
    if (!copy.book_active) throw ApiError.badRequest("This book is not available for lending", "VALIDATION_ERROR");

    const profile = await client.query(`SELECT id FROM students WHERE student_no = $1`, [studentNo.trim()]);
    if (profile.rows.length === 0) throw ApiError.notFound("Student not found");
    const profileId = profile.rows[0].id as string;

    if ((await activeLoanCount(client, profileId)) >= LIBRARY_MAX_ACTIVE_LOANS) {
      throw ApiError.badRequest(`Borrowing limit reached (max ${LIBRARY_MAX_ACTIVE_LOANS} active loans)`, "VALIDATION_ERROR");
    }

    const bookId = copy.book_id as string;
    if (copy.status === "ISSUED" || copy.status === "LOST" || copy.status === "DAMAGED" || copy.status === "MAINTENANCE") {
      throw ApiError.conflict(`Copy is currently ${String(copy.status).toLowerCase()}`, "ALLOCATION_CONFLICT");
    }
    if (copy.status === "RESERVED") {
      const ready = await client.query(
        `SELECT * FROM library_reservations WHERE book_id = $1 AND student_id = $2 AND status = 'READY' LIMIT 1`,
        [bookId, profileId],
      );
      if (ready.rows.length === 0) {
        throw ApiError.conflict("Copy is reserved for another student", "ALLOCATION_CONFLICT");
      }
      await client.query(`UPDATE library_reservations SET status = 'FULFILLED', fulfilled_at = now() WHERE id = $1`, [
        ready.rows[0].id,
      ]);
    } else {
      // AVAILABLE copy: FIFO — a queued waiter for this book has priority.
      const waiter = await firstWaiter(client, bookId);
      if (waiter && (waiter.student_id as string) !== profileId) {
        throw ApiError.conflict("This book has students waiting in the reservation queue", "RESERVATION_CONFLICT");
      }
      if (waiter && (waiter.student_id as string) === profileId) {
        await client.query(`UPDATE library_reservations SET status = 'FULFILLED', fulfilled_at = now() WHERE id = $1`, [
          waiter.id,
        ]);
      }
    }

    const loan = await client.query(
      `INSERT INTO library_loans (copy_id, student_id, due_at, issued_by)
       VALUES ($1, $2, ($5::date + $3::int), $4) RETURNING *`,
      [copyId, profileId, String(loanDays), issuerId, todayLocalDate()],
    );
    await client.query(`UPDATE book_copies SET status = 'ISSUED' WHERE id = $1`, [copyId]);
    return loan.rows[0];
  });
}

export async function returnBook(returnerId: string, loanId: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM library_loans WHERE id = $1 FOR UPDATE`, [loanId]);
    if (found.rows.length === 0) throw ApiError.notFound("Loan not found");
    const loan = found.rows[0];
    if (loan.status !== "ACTIVE") throw ApiError.badRequest("Only active loans can be returned", "VALIDATION_ERROR");

    const overdueDays = overdueDaysSince(loan.due_at);
    const fine = fineForOverdueDays(overdueDays);

    await client.query(`UPDATE library_loans SET status = 'RETURNED', returned_at = now(), returned_by = $1 WHERE id = $2`, [
      returnerId,
      loanId,
    ]);

    let feeRow: Record<string, unknown> | null = null;
    if (fine > 0) {
      // One fee row per loan (upsert): recalculation never duplicates.
      const existing = await client.query(`SELECT * FROM fees WHERE library_loan_id = $1`, [loanId]);
      const title = `Library Fine - overdue ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
      if (existing.rows.length > 0) {
        const paid = Number(existing.rows[0].amount_paid);
        const status = paid >= fine ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
        const updated = await client.query(
          `UPDATE fees SET amount = $1, fee_type = $2, status = $3, due_date = CURRENT_DATE + INTERVAL '14 days' WHERE id = $4 RETURNING *`,
          [fine, title, status, existing.rows[0].id],
        );
        feeRow = updated.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO fees (student_id, fee_type, amount, amount_paid, due_date, status, library_loan_id)
           VALUES ($1, $2, $3, 0, CURRENT_DATE + INTERVAL '14 days', 'PENDING', $4) RETURNING *`,
          [loan.student_id, title, fine, loanId],
        );
        feeRow = inserted.rows[0];
      }
    }

    // FIFO: the longest-waiting reserver gets priority on this copy.
    const copyId = loan.copy_id as string;
    const copyRow = await client.query(
      `SELECT c.*, b.id AS book_id FROM book_copies c JOIN books b ON b.id = c.book_id WHERE c.id = $1`,
      [copyId],
    );
    const waiter = await firstWaiter(client, copyRow.rows[0].book_id as string);
    let nextReservation: Record<string, unknown> | null = null;
    if (waiter) {
      const promoted = await client.query(
        `UPDATE library_reservations SET status = 'READY' WHERE id = $1 RETURNING *`,
        [waiter.id],
      );
      nextReservation = promoted.rows[0];
      await client.query(`UPDATE book_copies SET status = 'RESERVED' WHERE id = $1`, [copyId]);
    } else {
      await client.query(`UPDATE book_copies SET status = 'AVAILABLE' WHERE id = $1`, [copyId]);
    }

    return { overdueDays, fine, fee: feeRow, nextReservation };
  });
}

export async function renewLoan(userId: string, loanId: string) {
  const profileId = await requireStudentProfile(userId);
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM library_loans WHERE id = $1 FOR UPDATE`, [loanId]);
    if (found.rows.length === 0 || (found.rows[0].student_id as string) !== profileId) {
      throw ApiError.notFound("Loan not found");
    }
    const loan = found.rows[0];
    if (loan.status !== "ACTIVE") throw ApiError.badRequest("Only active loans can be renewed", "VALIDATION_ERROR");
    if (Number(loan.renewed_count) >= LIBRARY_MAX_RENEWALS) {
      throw ApiError.badRequest(`Renewal limit reached (max ${LIBRARY_MAX_RENEWALS})`, "VALIDATION_ERROR");
    }
    const copyRow = await client.query(`SELECT book_id FROM book_copies WHERE id = $1`, [loan.copy_id]);
    const waiter = await firstWaiter(client, copyRow.rows[0].book_id as string);
    if (waiter && (waiter.student_id as string) !== profileId) {
      throw ApiError.conflict("Renewal blocked: another student is waiting for this book", "RESERVATION_CONFLICT");
    }
    if (overdueDaysSince(loan.due_at) > 0) {
      throw ApiError.badRequest("Overdue loans cannot be renewed — please return the book", "VALIDATION_ERROR");
    }
    const updated = await client.query(
      `UPDATE library_loans SET due_at = due_at + ($1 || ' days')::interval, renewed_count = renewed_count + 1 WHERE id = $2 RETURNING *`,
      [String(LIBRARY_LOAN_DAYS), loanId],
    );
    return updated.rows[0];
  });
}

// ------------------------------------------------------------- reservations

export async function reserveBook(userId: string, bookId: string) {
  const profileId = await requireStudentProfile(userId);
  const book = await queryOne<{ id: string; active: boolean }>(`SELECT id, active FROM books WHERE id = $1`, [bookId]);
  if (!book) throw ApiError.notFound("Book not found");
  if (!book.active) throw ApiError.badRequest("This book is not available for reservation", "VALIDATION_ERROR");
  const active = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM library_reservations WHERE student_id = $1 AND status IN ('WAITING','READY')`,
    [profileId],
  );
  if (Number(active?.n ?? 0) >= LIBRARY_MAX_ACTIVE_RESERVATIONS) {
    throw ApiError.badRequest(`Reservation limit reached (max ${LIBRARY_MAX_ACTIVE_RESERVATIONS})`, "VALIDATION_ERROR");
  }
  try {
    const rows = await query(
      `INSERT INTO library_reservations (book_id, student_id) VALUES ($1, $2) RETURNING *`,
      [bookId, profileId],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "You already have an active reservation for this book");
  }
}

export async function cancelReservation(userId: string, reservationId: string) {
  const profileId = await requireStudentProfile(userId);
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM library_reservations WHERE id = $1 FOR UPDATE`, [reservationId]);
    if (found.rows.length === 0 || (found.rows[0].student_id as string) !== profileId) {
      throw ApiError.notFound("Reservation not found");
    }
    const reservation = found.rows[0];
    if (reservation.status !== "WAITING" && reservation.status !== "READY") {
      throw ApiError.badRequest("Only waiting reservations can be cancelled", "VALIDATION_ERROR");
    }
    await client.query(`UPDATE library_reservations SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [
      reservationId,
    ]);
    // A cancelled READY hold passes to the next waiter, else the copy frees up.
    const held = await client.query(
      `SELECT id FROM book_copies WHERE book_id = $1 AND status = 'RESERVED' ORDER BY accession_number ASC LIMIT 1`,
      [reservation.book_id],
    );
    if (reservation.status === "READY" && held.rows.length > 0) {
      const next = await firstWaiter(client, reservation.book_id as string);
      if (next) {
        await client.query(`UPDATE library_reservations SET status = 'READY' WHERE id = $1`, [next.id]);
      } else {
        await client.query(`UPDATE book_copies SET status = 'AVAILABLE' WHERE id = $1`, [held.rows[0].id]);
      }
    }
    return { id: reservationId, status: "CANCELLED" as const };
  });
}

export async function getMyReservations(userId: string) {
  const profileId = await requireStudentProfile(userId);
  return listReservations({ studentId: profileId });
}

export async function listReservations(filter: { bookId?: string; studentId?: string; status?: string } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.bookId) {
    conditions.push(`r.book_id = $${params.length + 1}`);
    params.push(filter.bookId);
  }
  if (filter.studentId) {
    conditions.push(`r.student_id = $${params.length + 1}`);
    params.push(filter.studentId);
  }
  if (filter.status) {
    conditions.push(`r.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  const rows = await query(
    `SELECT r.*, b.title AS book_title, st.student_no, u.name AS student_name,
            (SELECT count(*)::int FROM library_reservations r2
              WHERE r2.book_id = r.book_id AND r2.status = 'WAITING' AND r2.requested_at <= r.requested_at) AS queue_position
     FROM library_reservations r
     JOIN books b ON b.id = r.book_id
     JOIN students st ON st.id = r.student_id
     JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY r.requested_at ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    bookId: row.book_id as string,
    bookTitle: row.book_title as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    status: row.status as Reservation["status"],
    queuePosition: row.status === "WAITING" ? Number(row.queue_position) : null,
    requestedAt: new Date(row.requested_at as string).toISOString(),
  }));
}

export async function adminCancelReservation(reservationId: string) {
  const rows = await query(
    `UPDATE library_reservations SET status = 'CANCELLED', cancelled_at = now()
     WHERE id = $1 AND status IN ('WAITING','READY') RETURNING *`,
    [reservationId],
  );
  if (rows.length === 0) throw ApiError.notFound("Active reservation not found");
  return rows[0];
}

// ------------------------------------------------------------------- fines

export async function getMyFines(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const feeRows = await query(
    `SELECT f.id, f.fee_type, f.amount, f.amount_paid, f.due_date, f.status, f.library_loan_id,
            b.title AS book_title
     FROM fees f LEFT JOIN library_loans l ON l.id = f.library_loan_id
     LEFT JOIN book_copies c ON c.id = l.copy_id LEFT JOIN books b ON b.id = c.book_id
     WHERE f.student_id = $1 AND f.library_loan_id IS NOT NULL
     ORDER BY f.due_date ASC`,
    [profileId],
  );
  const active = await listLoans({ studentId: profileId, status: "ACTIVE" });
  const accruing = active
    .filter((loan) => loan.overdue)
    .map((loan) => ({ loanId: loan.id, bookTitle: loan.bookTitle, overdueDays: loan.overdueDays, currentFine: loan.currentFine }));
  const totalBalance = feeRows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.amount_paid)), 0);
  return {
    totalBalance: Math.round(totalBalance * 100) / 100,
    ledger: feeRows.map((row) => ({
      id: row.id as string,
      loanId: row.library_loan_id as string,
      bookTitle: (row.book_title as string) ?? "",
      amount: Number(row.amount),
      amountPaid: Number(row.amount_paid),
      balance: Math.max(0, Math.round((Number(row.amount) - Number(row.amount_paid)) * 100) / 100),
      status: row.status as string,
      dueDate: toLocalDateString(row.due_date as string),
    })),
    accruing,
  };
}

export async function listLibraryFines() {
  const rows = await query(
    `SELECT f.id, f.fee_type, f.amount, f.amount_paid, f.due_date, f.status, f.library_loan_id,
            st.student_no, u.name AS student_name, b.title AS book_title
     FROM fees f
     JOIN students st ON st.id = f.student_id
     JOIN users u ON u.id = st.user_id
     LEFT JOIN library_loans l ON l.id = f.library_loan_id
     LEFT JOIN book_copies c ON c.id = l.copy_id
     LEFT JOIN books b ON b.id = c.book_id
     WHERE f.library_loan_id IS NOT NULL
     ORDER BY f.due_date ASC LIMIT 200`,
    [],
  );
  return rows.map((row) => ({
    id: row.id as string,
    loanId: row.library_loan_id as string,
    bookTitle: (row.book_title as string) ?? "",
    studentNo: row.student_no as string,
    studentName: row.student_name as string,
    amount: Number(row.amount),
    amountPaid: Number(row.amount_paid),
    balance: Math.max(0, Math.round((Number(row.amount) - Number(row.amount_paid)) * 100) / 100),
    status: row.status as string,
    dueDate: toLocalDateString(row.due_date as string),
  }));
}

// ------------------------------------------------------------------ parent

export async function getLibraryForParent(parentUserId: string, studentId: string) {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const profileId = await requireStudentProfile(studentUserId);
  const [loans, reservations, fines] = await Promise.all([
    listLoans({ studentId: profileId, status: "ACTIVE" }),
    listReservations({ studentId: profileId }),
    getMyFines(studentUserId),
  ]);
  return {
    activeLoans: loans.map((loan) => ({
      bookTitle: loan.bookTitle,
      dueAt: loan.dueAt,
      overdue: loan.overdue,
      overdueDays: loan.overdueDays,
      renewedCount: loan.renewedCount,
    })),
    reservations: reservations
      .filter((r) => r.status === "WAITING" || r.status === "READY")
      .map((r) => ({ bookTitle: r.bookTitle, status: r.status, queuePosition: r.queuePosition })),
    fineTotal: fines.totalBalance,
  };
}
