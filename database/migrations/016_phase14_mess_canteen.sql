-- 016_phase14_mess_canteen.sql
-- Phase 14: mess & canteen management. Billing reuses the fees ledger
-- (fee_type 'Mess Plan - YYYY-MM' / 'Canteen - YYYY-MM'); no second ledger.

CREATE TABLE IF NOT EXISTS mess_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  description   TEXT NOT NULL DEFAULT '',
  billing_type  TEXT NOT NULL DEFAULT 'MONTHLY'
                CHECK (billing_type IN ('MONTHLY', 'WEEKLY', 'MEAL_BASED')),
  price         NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  meals_per_day INT NOT NULL DEFAULT 4 CHECK (meals_per_day BETWEEN 1 AND 6),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mess_enrollments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES mess_plans (id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date   DATE,
  status     TEXT NOT NULL DEFAULT 'ACTIVE'
             CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED')),
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_date_order CHECK (end_date IS NULL OR end_date >= start_date)
);

-- One active plan per student (no conflicting simultaneous enrollments).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mess_enroll_active
  ON mess_enrollments (student_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_mess_enroll_student ON mess_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_mess_enroll_status ON mess_enrollments (status);

CREATE TABLE IF NOT EXISTS mess_menu (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_date        DATE NOT NULL,
  meal_type        TEXT NOT NULL
                   CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')),
  menu_description TEXT NOT NULL CHECK (length(trim(menu_description)) >= 2),
  calories         INT CHECK (calories IS NULL OR calories >= 0),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meal_date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_mess_menu_date ON mess_menu (meal_date);

CREATE TABLE IF NOT EXISTS meal_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  meal_date   DATE NOT NULL,
  meal_type   TEXT NOT NULL
              CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')),
  consumed    BOOLEAN NOT NULL DEFAULT true,
  recorded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, meal_date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_attendance_student ON meal_attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_meal_attendance_date ON meal_attendance (meal_date);

CREATE TABLE IF NOT EXISTS canteen_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  category    TEXT NOT NULL DEFAULT 'OTHER'
              CHECK (category IN ('BEVERAGE', 'SNACK', 'MEAL', 'DESSERT', 'OTHER')),
  description TEXT NOT NULL DEFAULT '',
  price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  available   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canteen_items_category ON canteen_items (category);
CREATE INDEX IF NOT EXISTS idx_canteen_items_available ON canteen_items (available);
CREATE INDEX IF NOT EXISTS idx_canteen_items_name ON canteen_items (lower(name));

CREATE TABLE IF NOT EXISTS canteen_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED')),
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  fee_id       UUID REFERENCES fees (id) ON DELETE SET NULL,
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canteen_orders_student ON canteen_orders (student_id);
CREATE INDEX IF NOT EXISTS idx_canteen_orders_status ON canteen_orders (status);
CREATE INDEX IF NOT EXISTS idx_canteen_orders_ordered ON canteen_orders (ordered_at DESC);

CREATE TABLE IF NOT EXISTS canteen_order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES canteen_orders (id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES canteen_items (id) ON DELETE RESTRICT,
  quantity    INT NOT NULL CHECK (quantity >= 1 AND quantity <= 50),
  unit_price  NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_canteen_order_items_order ON canteen_order_items (order_id);

CREATE TABLE IF NOT EXISTS mess_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  meal_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type  TEXT NOT NULL
             CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')),
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mess_feedback_date ON mess_feedback (meal_date);
CREATE INDEX IF NOT EXISTS idx_mess_feedback_meal ON mess_feedback (meal_type);

-- Idempotent monthly billing: one mess-plan row and one canteen row per
-- student per period. The billing service upserts against these constraints.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_mess_period
  ON fees (student_id, fee_type) WHERE fee_type LIKE 'Mess Plan - %';
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_canteen_period
  ON fees (student_id, fee_type) WHERE fee_type LIKE 'Canteen - %';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mess_plans', 'mess_enrollments', 'mess_menu', 'meal_attendance',
    'canteen_items', 'canteen_orders', 'canteen_order_items', 'mess_feedback'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
