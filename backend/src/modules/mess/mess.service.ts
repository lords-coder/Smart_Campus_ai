import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import type {
  CanteenItem,
  CanteenOrder,
  FoodFeeRecord,
  MealAttendanceRecord,
  MessEnrollment,
  MessFeedback,
  MessPlan,
  MenuEntry,
} from "./mess.types";

type TxClient = PoolClient;

export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"] as const;

const ORDER_FLOW: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

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

function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { first, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

// ------------------------------------------------------------------- plans

export async function listPlans(activeOnly = true): Promise<MessPlan[]> {
  const rows = await query(
    `SELECT * FROM mess_plans ${activeOnly ? `WHERE active = true` : ""} ORDER BY price ASC LIMIT 100`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    billingType: row.billing_type as MessPlan["billingType"],
    price: Number(row.price),
    mealsPerDay: Number(row.meals_per_day),
    active: Boolean(row.active),
  }));
}

export async function createPlan(input: { name: string; description?: string; billingType?: string; price: number; mealsPerDay?: number }) {
  const rows = await query(
    `INSERT INTO mess_plans (name, description, billing_type, price, meals_per_day)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name.trim(), input.description?.trim() ?? "", input.billingType ?? "MONTHLY", input.price, input.mealsPerDay ?? 4],
  );
  return rows[0];
}

export async function updatePlan(id: string, updates: Record<string, unknown>) {
  const allowed = ["name", "description", "price", "meals_per_day", "active"] as const;
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
  const rows = await query(`UPDATE mess_plans SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Mess plan not found");
  return rows[0];
}

// -------------------------------------------------------------- enrollment

function mapEnrollment(row: Record<string, unknown>): MessEnrollment {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    planId: row.plan_id as string,
    planName: (row.plan_name as string) ?? undefined,
    billingType: row.billing_type as MessEnrollment["billingType"],
    price: row.price === undefined ? undefined : Number(row.price),
    startDate: toLocalDateString(row.start_date as string),
    endDate: row.end_date ? toLocalDateString(row.end_date as string) : null,
    status: row.status as MessEnrollment["status"],
    autoRenew: Boolean(row.auto_renew),
  };
}

const ENROLL_SELECT = `
  SELECT e.*, p.name AS plan_name, p.billing_type, p.price,
         st.student_no, u.name AS student_name
  FROM mess_enrollments e
  JOIN mess_plans p ON p.id = e.plan_id
  JOIN students st ON st.id = e.student_id
  JOIN users u ON u.id = st.user_id
`;

export async function getMyEnrollment(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`${ENROLL_SELECT} WHERE e.student_id = $1 AND e.status = 'ACTIVE'`, [profileId]);
  return rows.length > 0 ? mapEnrollment(rows[0]) : null;
}

export async function enrollStudent(userId: string, planId: string, startDate?: string) {
  const profileId = await requireStudentProfile(userId);
  const plan = await queryOne<{ id: string; active: boolean }>(`SELECT id, active FROM mess_plans WHERE id = $1`, [planId]);
  if (!plan) throw ApiError.notFound("Mess plan not found");
  if (!plan.active) throw ApiError.badRequest("This mess plan is not currently offered", "VALIDATION_ERROR");
  try {
    const rows = await query(
      `INSERT INTO mess_enrollments (student_id, plan_id, start_date) VALUES ($1, $2, $3) RETURNING *`,
      [profileId, planId, startDate ?? new Date().toISOString().slice(0, 10)],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "You already have an active mess plan");
  }
}

export async function cancelMyEnrollment(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `UPDATE mess_enrollments SET status = 'CANCELLED', end_date = CURRENT_DATE
     WHERE student_id = $1 AND status IN ('ACTIVE', 'PAUSED') RETURNING *`,
    [profileId],
  );
  if (rows.length === 0) throw ApiError.notFound("No active enrollment to cancel");
  return rows[0];
}

export async function listEnrollments(status?: string) {
  const rows = await query(
    `${ENROLL_SELECT} ${status ? `WHERE e.status = $1` : ""} ORDER BY e.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return rows.map(mapEnrollment);
}

export async function updateEnrollment(id: string, updates: { status?: string; planId?: string; endDate?: string | null }) {
  if (updates.planId) {
    const plan = await queryOne<{ id: string }>(`SELECT id FROM mess_plans WHERE id = $1`, [updates.planId]);
    if (!plan) throw ApiError.notFound("Mess plan not found");
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.status !== undefined) {
    sets.push(`status = $${params.length + 1}`);
    params.push(updates.status);
    if (updates.status === "CANCELLED" || updates.status === "EXPIRED") sets.push(`end_date = COALESCE(end_date, CURRENT_DATE)`);
  }
  if (updates.planId !== undefined) {
    sets.push(`plan_id = $${params.length + 1}`);
    params.push(updates.planId);
  }
  if (updates.endDate !== undefined) {
    sets.push(`end_date = $${params.length + 1}`);
    params.push(updates.endDate);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  try {
    const rows = await query(`UPDATE mess_enrollments SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw ApiError.notFound("Enrollment not found");
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "Student already has an active enrollment");
  }
}

// -------------------------------------------------------------------- menu

export async function listMenu(from: string, to: string): Promise<MenuEntry[]> {
  const rows = await query(
    `SELECT * FROM mess_menu WHERE meal_date >= $1 AND meal_date <= $2 AND active = true
     ORDER BY meal_date ASC LIMIT 200`,
    [from, to],
  );
  return rows.map((row) => ({
    id: row.id as string,
    mealDate: toLocalDateString(row.meal_date as string),
    mealType: row.meal_type as MenuEntry["mealType"],
    menuDescription: row.menu_description as string,
    calories: row.calories === null ? null : Number(row.calories),
    active: Boolean(row.active),
  }));
}

export function menuRange(scope: string | undefined, from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => toLocalDateString(d);
  if (from || to) {
    const end = to ?? from ?? iso(today);
    return { from: from ?? end, to: end };
  }
  if (scope === "tomorrow") {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return { from: iso(t), to: iso(t) };
  }
  if (scope === "week") {
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    return { from: iso(today), to: iso(end) };
  }
  return { from: iso(today), to: iso(today) };
}

export async function createMenuEntry(mealDate: string, mealType: string, menuDescription: string, calories?: number | null) {
  try {
    const rows = await query(
      `INSERT INTO mess_menu (meal_date, meal_type, menu_description, calories) VALUES ($1, $2, $3, $4) RETURNING *`,
      [mealDate, mealType, menuDescription.trim(), calories ?? null],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A menu entry already exists for this date and meal");
  }
}

export async function updateMenuEntry(id: string, updates: { menuDescription?: string; calories?: number | null; active?: boolean }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.menuDescription !== undefined) {
    sets.push(`menu_description = $${params.length + 1}`);
    params.push(updates.menuDescription.trim());
  }
  if (updates.calories !== undefined) {
    sets.push(`calories = $${params.length + 1}`);
    params.push(updates.calories);
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${params.length + 1}`);
    params.push(updates.active);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE mess_menu SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Menu entry not found");
  return rows[0];
}

export async function deleteMenuEntry(id: string) {
  const rows = await query(`DELETE FROM mess_menu WHERE id = $1 RETURNING id`, [id]);
  if (rows.length === 0) throw ApiError.notFound("Menu entry not found");
  return { id };
}

// ---------------------------------------------------------- meal attendance

export async function recordMealAttendance(recorderId: string, studentNo: string, mealDate: string, mealType: string, consumed: boolean) {
  const profileId = await profileIdByNo(studentNo);
  const rows = await query(
    `INSERT INTO meal_attendance (student_id, meal_date, meal_type, consumed, recorded_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_id, meal_date, meal_type)
     DO UPDATE SET consumed = EXCLUDED.consumed, recorded_by = EXCLUDED.recorded_by
     RETURNING *`,
    [profileId, mealDate, mealType, consumed, recorderId],
  );
  return rows[0];
}

export async function mealHistory(profileId: string, from?: string, to?: string, limit = 60): Promise<MealAttendanceRecord[]> {
  const conditions = [`student_id = $1`];
  const params: unknown[] = [profileId];
  if (from) {
    conditions.push(`meal_date >= $${params.length + 1}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`meal_date <= $${params.length + 1}`);
    params.push(to);
  }
  const rows = await query(
    `SELECT * FROM meal_attendance WHERE ${conditions.join(" AND ")} ORDER BY meal_date DESC LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    mealDate: toLocalDateString(row.meal_date as string),
    mealType: row.meal_type as MealAttendanceRecord["mealType"],
    consumed: Boolean(row.consumed),
  }));
}

export async function myMealHistory(userId: string, from?: string, to?: string, limit?: number) {
  const profileId = await requireStudentProfile(userId);
  return mealHistory(profileId, from, to, limit);
}

export async function adminMealHistory(filter: { studentNo?: string; from?: string; to?: string; limit?: number }) {
  let profileId: string | undefined;
  if (filter.studentNo) profileId = await profileIdByNo(filter.studentNo);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (profileId) {
    conditions.push(`m.student_id = $${params.length + 1}`);
    params.push(profileId);
  }
  if (filter.from) {
    conditions.push(`m.meal_date >= $${params.length + 1}`);
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push(`m.meal_date <= $${params.length + 1}`);
    params.push(filter.to);
  }
  const rows = await query(
    `SELECT m.*, st.student_no, u.name AS student_name FROM meal_attendance m
     JOIN students st ON st.id = m.student_id JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY m.meal_date DESC LIMIT $${params.length + 1}`,
    [...params, filter.limit ?? 200],
  );
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string,
    studentName: row.student_name as string,
    mealDate: toLocalDateString(row.meal_date as string),
    mealType: row.meal_type as MealAttendanceRecord["mealType"],
    consumed: Boolean(row.consumed),
  }));
}

// ------------------------------------------------------------------ feedback

export async function submitFeedback(userId: string, mealDate: string | undefined, mealType: string, rating: number, comment: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `INSERT INTO mess_feedback (student_id, meal_date, meal_type, rating, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [profileId, mealDate ?? new Date().toISOString().slice(0, 10), mealType, rating, comment.trim()],
  );
  return rows[0];
}

export async function myFeedback(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`SELECT * FROM mess_feedback WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`, [profileId]);
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    mealDate: toLocalDateString(row.meal_date as string),
    mealType: row.meal_type as MessFeedback["mealType"],
    rating: Number(row.rating),
    comment: (row.comment as string) ?? "",
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export async function feedbackSummary() {
  const rows = await query(
    `SELECT meal_type, AVG(rating)::float AS avg_rating, COUNT(*)::int AS n FROM mess_feedback GROUP BY meal_type`,
  );
  const recent = await query(`SELECT * FROM mess_feedback ORDER BY created_at DESC LIMIT 50`);
  return {
    byMealType: rows.map((row) => ({
      mealType: row.meal_type as string,
      avgRating: Math.round(Number(row.avg_rating) * 10) / 10,
      count: Number(row.n),
    })),
    recentCount: recent.length,
  };
}

// ------------------------------------------------------------------- canteen

export async function listItems(filter: { q?: string; category?: string; available?: boolean; availableOnlyForStudents?: boolean }): Promise<CanteenItem[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    conditions.push(`(name ILIKE $${params.length + 1})`);
    params.push(`%${filter.q}%`);
  }
  if (filter.category) {
    conditions.push(`category = $${params.length + 1}`);
    params.push(filter.category);
  }
  if (filter.available !== undefined) {
    conditions.push(`available = $${params.length + 1}`);
    params.push(filter.available);
  }
  const rows = await query(
    `SELECT * FROM canteen_items ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY name ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as CanteenItem["category"],
    description: (row.description as string) ?? "",
    price: Number(row.price),
    available: Boolean(row.available),
  }));
}

export async function createItem(input: { name: string; category?: string; description?: string; price: number }) {
  const rows = await query(
    `INSERT INTO canteen_items (name, category, description, price) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name.trim(), input.category ?? "OTHER", input.description?.trim() ?? "", input.price],
  );
  return rows[0];
}

export async function updateItem(id: string, updates: Record<string, unknown>) {
  const allowed = ["name", "category", "description", "price", "available"] as const;
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
  const rows = await query(`UPDATE canteen_items SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Canteen item not found");
  return rows[0];
}

// -------------------------------------------------------------------- orders

const ORDER_SELECT = `
  SELECT o.*, st.student_no, u.name AS student_name
  FROM canteen_orders o
  JOIN students st ON st.id = o.student_id
  JOIN users u ON u.id = st.user_id
`;

async function orderItems(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, CanteenOrder["items"]>();
  const rows = await query(
    `SELECT oi.*, i.name AS item_name FROM canteen_order_items oi
     JOIN canteen_items i ON i.id = oi.item_id
     WHERE oi.order_id = ANY($1::uuid[]) ORDER BY i.name ASC`,
    [orderIds],
  );
  const byOrder = new Map<string, CanteenOrder["items"]>();
  for (const row of rows) {
    const list = byOrder.get(row.order_id as string) ?? [];
    list.push({
      itemId: row.item_id as string,
      itemName: row.item_name as string,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      totalPrice: Number(row.total_price),
    });
    byOrder.set(row.order_id as string, list);
  }
  return byOrder;
}

function mapOrder(row: Record<string, unknown>, items: CanteenOrder["items"] = []): CanteenOrder {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    status: row.status as CanteenOrder["status"],
    totalAmount: Number(row.total_amount),
    orderedAt: new Date(row.ordered_at as string).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string).toISOString() : null,
    items,
  };
}

export async function createOrder(userId: string, items: Array<{ itemId: string; quantity: number }>) {
  const profileId = await requireStudentProfile(userId);
  return withTransaction(async (client) => {
    let total = 0;
    const lines: Array<{ itemId: string; quantity: number; unitPrice: number; totalPrice: number }> = [];
    for (const line of items) {
      const found = await client.query(`SELECT * FROM canteen_items WHERE id = $1 FOR UPDATE`, [line.itemId]);
      if (found.rows.length === 0) throw ApiError.notFound("Canteen item not found");
      const item = found.rows[0];
      if (!item.available) throw ApiError.badRequest(`"${item.name}" is currently unavailable`, "VALIDATION_ERROR");
      const unitPrice = Number(item.price);
      const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
      total = Math.round((total + lineTotal) * 100) / 100;
      lines.push({ itemId: line.itemId, quantity: line.quantity, unitPrice, totalPrice: lineTotal });
    }
    if (lines.length === 0) throw ApiError.badRequest("Order must contain at least one item", "VALIDATION_ERROR");
    const order = await client.query(
      `INSERT INTO canteen_orders (student_id, total_amount) VALUES ($1, $2) RETURNING *`,
      [profileId, total],
    );
    const orderId = order.rows[0].id as string;
    for (const line of lines) {
      await client.query(
        `INSERT INTO canteen_order_items (order_id, item_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, line.itemId, line.quantity, line.unitPrice, line.totalPrice],
      );
    }
    return { ...order.rows[0], items: lines };
  });
}

export async function myOrders(userId: string, status?: string) {
  const profileId = await requireStudentProfile(userId);
  const conditions = [`o.student_id = $1`];
  const params: unknown[] = [profileId];
  if (status) {
    conditions.push(`o.status = $${params.length + 1}`);
    params.push(status);
  }
  const rows = await query(`${ORDER_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY o.ordered_at DESC LIMIT 100`, params);
  const items = await orderItems(rows.map((r) => r.id as string));
  return rows.map((row) => mapOrder(row, items.get(row.id as string) ?? []));
}

export async function cancelMyOrder(userId: string, orderId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `UPDATE canteen_orders SET status = 'CANCELLED', cancelled_at = now()
     WHERE id = $1 AND student_id = $2 AND status IN ('PENDING', 'CONFIRMED') RETURNING *`,
    [orderId, profileId],
  );
  if (rows.length === 0) throw ApiError.notFound("Cancellable order not found");
  return rows[0];
}

export async function listOrders(filter: { status?: string; limit?: number } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`o.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  const rows = await query(
    `${ORDER_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY o.ordered_at DESC LIMIT $${params.length + 1}`,
    [...params, filter.limit ?? 200],
  );
  const items = await orderItems(rows.map((r) => r.id as string));
  return rows.map((row) => mapOrder(row, items.get(row.id as string) ?? []));
}

export async function updateOrderStatus(orderId: string, to: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM canteen_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (found.rows.length === 0) throw ApiError.notFound("Order not found");
    const from = found.rows[0].status as string;
    if (!(ORDER_FLOW[from] ?? []).includes(to)) {
      throw ApiError.badRequest(`Cannot move order from ${from} to ${to}`, "INVALID_TRANSITION");
    }
    const stamp = to === "COMPLETED" ? `, completed_at = now()` : to === "CANCELLED" ? `, cancelled_at = now()` : "";
    const updated = await client.query(
      `UPDATE canteen_orders SET status = $1${stamp} WHERE id = $2 RETURNING *`,
      [to, orderId],
    );
    return updated.rows[0];
  });
}

// ------------------------------------------------------------------- billing

function feeStatusFor(amount: number, paid: number): string {
  if (paid >= amount) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "PENDING";
}

async function upsertFoodFee(
  client: TxClient,
  profileId: string,
  feeType: string,
  amount: number,
  dueDate: string,
) {
  const existing = await client.query(`SELECT * FROM fees WHERE student_id = $1 AND fee_type = $2 FOR UPDATE`, [
    profileId,
    feeType,
  ]);
  if (existing.rows.length > 0) {
    const paid = Number(existing.rows[0].amount_paid);
    const updated = await client.query(
      `UPDATE fees SET amount = $1, status = $2, due_date = $3 WHERE id = $4 RETURNING *`,
      [amount, feeStatusFor(amount, paid), dueDate, existing.rows[0].id],
    );
    return { row: updated.rows[0], created: false };
  }
  const inserted = await client.query(
    `INSERT INTO fees (student_id, fee_type, amount, amount_paid, due_date, status)
     VALUES ($1, $2, $3, 0, $4, 'PENDING') RETURNING *`,
    [profileId, feeType, amount, dueDate],
  );
  return { row: inserted.rows[0], created: true };
}

function overlapDays(enrollStart: string, enrollEnd: string | null, monthFirst: string, monthLast: string): number {
  const start = enrollStart > monthFirst ? enrollStart : monthFirst;
  const end = enrollEnd && enrollEnd < monthLast ? enrollEnd : monthLast;
  if (end < start) return 0;
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Idempotent monthly billing for one student: recomputes the two period fee
 * rows (plan + canteen) and marks swept orders, so re-running never duplicates.
 */
export async function billStudentMonth(profileId: string, month: string) {
  const { first, last } = monthBounds(month);
  const dueDate = addDays(last, 14);
  return withTransaction(async (client) => {
    const enroll = await client.query(
      `SELECT e.*, p.billing_type, p.price FROM mess_enrollments e
       JOIN mess_plans p ON p.id = e.plan_id
       WHERE e.student_id = $1 AND e.status IN ('ACTIVE', 'PAUSED')
         AND e.start_date <= $2 AND (e.end_date IS NULL OR e.end_date >= $3)
       ORDER BY e.start_date DESC LIMIT 1 FOR UPDATE`,
      [profileId, last, first],
    );
    let planAmount = 0;
    let planDetail = "no active enrollment";
    if (enroll.rows.length > 0) {
      const e = enroll.rows[0];
      const days = overlapDays(e.start_date as string, (e.end_date as string | null) ?? null, first, last);
      if ((e.billing_type as string) === "MONTHLY") {
        planAmount = Number(e.price);
      } else if ((e.billing_type as string) === "WEEKLY") {
        planAmount = Math.round(Number(e.price) * Math.ceil(days / 7) * 100) / 100;
      } else {
        const consumed = await client.query(
          `SELECT count(*)::int AS n FROM meal_attendance
           WHERE student_id = $1 AND consumed = true AND meal_date >= $2 AND meal_date <= $3`,
          [profileId, first, last],
        );
        planAmount = Math.round(Number(e.price) * Number(consumed.rows[0]?.n ?? 0) * 100) / 100;
      }
      planDetail = `${e.billing_type} plan, ${days} day(s) in period`;
    }

    const unbilled = await client.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS sum, COUNT(*)::int AS n FROM canteen_orders
       WHERE student_id = $1 AND status = 'COMPLETED' AND fee_id IS NULL
         AND ordered_at >= $2::timestamptz AND ordered_at < ($3::date + INTERVAL '1 day')`,
      [profileId, first, last],
    );
    const canteenAmount = Math.round(Number(unbilled.rows[0]?.sum ?? 0) * 100) / 100;

    const result: Record<string, unknown> = {
      month,
      planAmount,
      planDetail,
      canteenAmount,
      canteenOrders: Number(unbilled.rows[0]?.n ?? 0),
      planFee: null,
      canteenFee: null,
      billed: false,
    };
    if (planAmount > 0) {
      const { row } = await upsertFoodFee(client, profileId, `Mess Plan - ${month}`, planAmount, dueDate);
      result.planFee = row.id;
      result.billed = true;
    }
    if (canteenAmount > 0) {
      const { row } = await upsertFoodFee(client, profileId, `Canteen - ${month}`, canteenAmount, dueDate);
      result.canteenFee = row.id;
      await client.query(
        `UPDATE canteen_orders SET fee_id = $1
         WHERE student_id = $2 AND status = 'COMPLETED' AND fee_id IS NULL
           AND ordered_at >= $3::timestamptz AND ordered_at < ($4::date + INTERVAL '1 day')`,
        [row.id, profileId, first, last],
      );
      result.billed = true;
    }
    return result;
  });
}

export async function generateBilling(adminId: string, month: string, studentNo?: string) {
  void adminId;
  if (!/^\d{4}-\d{2}$/.test(month)) throw ApiError.badRequest("Use YYYY-MM for month", "VALIDATION_ERROR");
  let profileIds: string[];
  if (studentNo) {
    profileIds = [await profileIdByNo(studentNo)];
  } else {
    const rows = await query(`SELECT DISTINCT student_id AS id FROM mess_enrollments WHERE status IN ('ACTIVE', 'PAUSED') LIMIT 500`);
    const withOrders = await query(
      `SELECT DISTINCT student_id AS id FROM canteen_orders WHERE status = 'COMPLETED' AND fee_id IS NULL LIMIT 500`,
    );
    profileIds = [...new Set([...rows.map((r) => r.id as string), ...withOrders.map((r) => r.id as string)])];
  }
  const results: Array<Record<string, unknown>> = [];
  for (const profileId of profileIds) {
    results.push({ studentId: profileId, ...(await billStudentMonth(profileId, month)) });
  }
  return { month, billed: results.filter((r) => r.billed).length, students: results };
}

export async function studentBilling(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const [enrollmentRows, fees, orders] = await Promise.all([
    query(
      `SELECT e.*, p.name AS plan_name, p.billing_type, p.price FROM mess_enrollments e
       JOIN mess_plans p ON p.id = e.plan_id
       WHERE e.student_id = $1 AND e.status = 'ACTIVE'`,
      [profileId],
    ),
    foodFees(profileId),
    (async () => {
      const rows = await query(
        `SELECT o.* FROM canteen_orders o WHERE o.student_id = $1 ORDER BY o.ordered_at DESC LIMIT 10`,
        [profileId],
      );
      const items = await orderItems(rows.map((r) => r.id as string));
      return rows.map((row) => mapOrderLite(row, items.get(row.id as string) ?? []));
    })(),
  ]);
  const outstanding = Math.round(fees.reduce((sum, f) => sum + f.balance, 0) * 100) / 100;
  return {
    enrollment: enrollmentRows.length > 0 ? mapEnrollmentLite(enrollmentRows[0]) : null,
    outstanding,
    fees,
    recentOrders: orders,
  };
}

// ------------------------------------------------- balances, analytics, parent

export async function foodFees(profileId: string): Promise<FoodFeeRecord[]> {
  const rows = await query(
    `SELECT id, fee_type, amount, amount_paid, due_date, status FROM fees
     WHERE student_id = $1 AND (fee_type LIKE 'Mess Plan - %' OR fee_type LIKE 'Canteen - %')
     ORDER BY due_date ASC LIMIT 100`,
    [profileId],
  );
  return rows.map((row) => {
    const amount = Number(row.amount);
    const paid = Number(row.amount_paid);
    return {
      id: row.id as string,
      feeType: row.fee_type as string,
      amount,
      amountPaid: paid,
      balance: Math.max(0, Math.round((amount - paid) * 100) / 100),
      dueDate: toLocalDateString(row.due_date as string),
      status: row.status as string,
    };
  });
}

export async function foodOutstanding(profileId: string): Promise<number> {
  const fees = await foodFees(profileId);
  return Math.round(fees.reduce((sum, f) => sum + f.balance, 0) * 100) / 100;
}

export async function messAnalytics() {
  const [enroll, meals, canteen, feedback] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active FROM mess_enrollments`),
    query(
      `SELECT COUNT(*) FILTER (WHERE consumed = true AND meal_date >= CURRENT_DATE - INTERVAL '30 days')::int AS consumed_30d,
              COUNT(*) FILTER (WHERE consumed = true AND meal_date >= CURRENT_DATE - INTERVAL '7 days')::int AS consumed_7d FROM meal_attendance`,
    ),
    query(
      `SELECT COALESCE(SUM(total_amount), 0) AS sales_30d, COUNT(*)::int AS orders_30d FROM canteen_orders
       WHERE status = 'COMPLETED' AND ordered_at >= now() - INTERVAL '30 days'`,
    ),
    query(`SELECT meal_type, AVG(rating)::float AS avg_rating, COUNT(*)::int AS n FROM mess_feedback GROUP BY meal_type`),
  ]);
  const participation = await query(
    `SELECT meal_date, COUNT(*) FILTER (WHERE consumed = true)::int AS consumed
     FROM meal_attendance WHERE meal_date >= CURRENT_DATE - INTERVAL '14 days'
     GROUP BY meal_date ORDER BY meal_date DESC LIMIT 14`,
  );
  const topItems = await query(
    `SELECT i.name, SUM(oi.quantity)::int AS qty, SUM(oi.total_price) AS revenue
     FROM canteen_order_items oi JOIN canteen_orders o ON o.id = oi.order_id
     JOIN canteen_items i ON i.id = oi.item_id
     WHERE o.status = 'COMPLETED' AND o.ordered_at >= now() - INTERVAL '30 days'
     GROUP BY i.name ORDER BY revenue DESC LIMIT 5`,
  );
  const outstanding = await query(
    `SELECT COALESCE(SUM(amount - amount_paid), 0) AS outstanding FROM fees
     WHERE (fee_type LIKE 'Mess Plan - %' OR fee_type LIKE 'Canteen - %') AND amount_paid < amount`,
  );
  return {
    activeEnrollments: Number(enroll[0]?.active ?? 0),
    mealsConsumed30d: Number(meals[0]?.consumed_30d ?? 0),
    mealsConsumed7d: Number(meals[0]?.consumed_7d ?? 0),
    participationByDay: participation.map((r) => ({
      date: toLocalDateString(r.meal_date as string),
      consumed: Number(r.consumed),
    })),
    canteenSales30d: Number(canteen[0]?.sales_30d ?? 0),
    canteenOrders30d: Number(canteen[0]?.orders_30d ?? 0),
    topItems: topItems.map((r) => ({ name: r.name as string, quantity: Number(r.qty), revenue: Number(r.revenue) })),
    outstandingFood: Number(outstanding[0]?.outstanding ?? 0),
    feedbackByMeal: feedback.map((r) => ({
      mealType: r.meal_type as string,
      avgRating: Math.round(Number(r.avg_rating) * 10) / 10,
      count: Number(r.n),
    })),
  };
}

export async function getMessForParent(parentUserId: string, studentId: string) {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const profileId = await requireStudentProfile(studentUserId);
  const [enrollmentRows, fees, orders, meals] = await Promise.all([
    query(
      `SELECT e.*, p.name AS plan_name, p.billing_type, p.price FROM mess_enrollments e
       JOIN mess_plans p ON p.id = e.plan_id
       WHERE e.student_id = $1 AND e.status = 'ACTIVE'`,
      [profileId],
    ),
    foodFees(profileId),
    (async () => {
      const rows = await query(
        `SELECT o.id, o.status, o.total_amount, o.ordered_at FROM canteen_orders o
         WHERE o.student_id = $1 ORDER BY o.ordered_at DESC LIMIT 5`,
        [profileId],
      );
      const items = await orderItems(rows.map((r) => r.id as string));
      return rows.map((row) => mapOrderLite(row, items.get(row.id as string) ?? []));
    })(),
    query(
      `SELECT COUNT(*) FILTER (WHERE consumed = true AND meal_date >= CURRENT_DATE - INTERVAL '7 days')::int AS consumed_7d,
              COUNT(*)::int AS marked_7d FROM meal_attendance WHERE student_id = $1`,
      [profileId],
    ),
  ]);
  const enrollment = enrollmentRows.length > 0 ? mapEnrollmentLite(enrollmentRows[0]) : null;
  const outstanding = fees.reduce((sum, f) => sum + f.balance, 0);
  return {
    enrollment,
    billing: { outstanding: Math.round(outstanding * 100) / 100, fees },
    recentOrders: orders,
    mealsLast7Days: { consumed: Number(meals[0]?.consumed_7d ?? 0), marked: Number(meals[0]?.marked_7d ?? 0) },
  };
}

function mapEnrollmentLite(row: Record<string, unknown>) {
  return {
    planName: row.plan_name as string,
    billingType: row.billing_type as string,
    price: Number(row.price),
    startDate: toLocalDateString(row.start_date as string),
    status: row.status as string,
  };
}

function mapOrderLite(
  row: Record<string, unknown>,
  items: Array<{ itemName: string; quantity: number; totalPrice: number }>,
) {
  return {
    id: row.id as string,
    status: row.status as string,
    totalAmount: Number(row.total_amount),
    orderedAt: new Date(row.ordered_at as string).toISOString(),
    items,
  };
}
