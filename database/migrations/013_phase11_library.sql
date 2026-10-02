-- 013_phase11_library.sql
-- Phase 11: university library — catalogue, copies, loans, reservations.
-- Fines reuse the existing fees ledger (see library_loan_id below); no second ledger.

CREATE TABLE IF NOT EXISTS books (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (length(trim(title)) >= 2),
  subtitle         TEXT NOT NULL DEFAULT '',
  isbn             TEXT NOT NULL UNIQUE,
  author           TEXT NOT NULL DEFAULT 'Unknown',
  publisher        TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'General',
  edition          TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  publication_year INT CHECK (publication_year IS NULL OR (publication_year BETWEEN 1500 AND 2100)),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Authors/categories stay denormalized text fields for the MVP (Phase 11):
-- no separate tables until per-author/per-category workflows are needed.
CREATE INDEX IF NOT EXISTS idx_books_title ON books USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_books_author ON books (lower(author));
CREATE INDEX IF NOT EXISTS idx_books_category ON books (lower(category));
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books (isbn);
CREATE INDEX IF NOT EXISTS idx_books_active ON books (active);

CREATE TABLE IF NOT EXISTS book_copies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id          UUID NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  accession_number TEXT NOT NULL UNIQUE,
  location         TEXT NOT NULL DEFAULT 'Main Stacks',
  status           TEXT NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'LOST', 'DAMAGED', 'MAINTENANCE')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_book_copies_book ON book_copies (book_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies (status);
CREATE INDEX IF NOT EXISTS idx_book_copies_accession ON book_copies (accession_number);

CREATE TABLE IF NOT EXISTS library_loans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id       UUID NOT NULL REFERENCES book_copies (id) ON DELETE RESTRICT,
  student_id    UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at        DATE NOT NULL,
  returned_at   TIMESTAMPTZ,
  renewed_count INT NOT NULL DEFAULT 0 CHECK (renewed_count >= 0),
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'RETURNED')),
  issued_by     UUID REFERENCES users (id) ON DELETE SET NULL,
  returned_by   UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active loan per copy (a copy cannot be double-issued).
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_loans_active_copy
  ON library_loans (copy_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_library_loans_student ON library_loans (student_id);
CREATE INDEX IF NOT EXISTS idx_library_loans_status ON library_loans (status);
CREATE INDEX IF NOT EXISTS idx_library_loans_due ON library_loans (due_at);

CREATE TABLE IF NOT EXISTS library_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     UUID NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'WAITING'
              CHECK (status IN ('WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live reservation per student per book (FIFO queue by requested_at).
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_res_active
  ON library_reservations (book_id, student_id) WHERE status IN ('WAITING', 'READY');
CREATE INDEX IF NOT EXISTS idx_library_res_book ON library_reservations (book_id);
CREATE INDEX IF NOT EXISTS idx_library_res_student ON library_reservations (student_id);
CREATE INDEX IF NOT EXISTS idx_library_res_status ON library_reservations (status);

-- Fine ledger link: library fines are ordinary fees rows pointing at the loan.
ALTER TABLE fees ADD COLUMN IF NOT EXISTS library_loan_id UUID REFERENCES library_loans (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_library_loan
  ON fees (library_loan_id) WHERE library_loan_id IS NOT NULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['books', 'book_copies', 'library_loans', 'library_reservations'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
