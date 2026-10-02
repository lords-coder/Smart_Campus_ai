export type CopyStatus = "AVAILABLE" | "ISSUED" | "RESERVED" | "LOST" | "DAMAGED" | "MAINTENANCE";
export type LoanStatus = "ACTIVE" | "RETURNED";
export type ReservationStatus = "WAITING" | "READY" | "FULFILLED" | "CANCELLED" | "EXPIRED";

export interface BookListItem {
  id: string;
  title: string;
  subtitle: string;
  isbn: string;
  author: string;
  publisher: string;
  category: string;
  edition: string;
  publicationYear: number | null;
  active: boolean;
  totalCopies: number;
  availableCopies: number;
}

export interface BookDetail extends BookListItem {
  description: string;
  copies: Array<{ id: string; accessionNumber: string; location: string; status: string }>;
}

export interface BookCopy {
  id: string;
  bookId: string;
  bookTitle?: string;
  accessionNumber: string;
  location: string;
  status: CopyStatus;
}

export interface Loan {
  id: string;
  copyId: string;
  accessionNumber?: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  issuedAt: string;
  dueAt: string;
  returnedAt: string | null;
  renewedCount: number;
  status: LoanStatus;
  overdue: boolean;
  overdueDays: number;
  currentFine: number;
}

export interface Reservation {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  status: ReservationStatus;
  queuePosition: number | null;
  requestedAt: string;
}

export interface LibraryFine {
  id: string | null;
  loanId: string;
  bookTitle: string;
  overdueDays: number;
  amount: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
