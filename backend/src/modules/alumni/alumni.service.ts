import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import type {
  AlumniDirectoryItem,
  EventAudience,
  MentorshipStatus,
} from "./alumni.types";
import { MENTORSHIP_TRANSITIONS } from "./alumni.types";

type TxClient = PoolClient;

const PROFILE_SELECT = `
  SELECT p.*, u.name AS name
  FROM alumni_profiles p JOIN users u ON u.id = p.user_id
`;

async function requireAlumniProfile(userId: string): Promise<Record<string, unknown>> {
  const rows = await query(`${PROFILE_SELECT} WHERE p.user_id = $1`, [userId]);
  if (rows.length === 0) throw ApiError.notFound("Alumni profile not found");
  return rows[0];
}

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

/** Public directory shape — name and professional fields only, never contact data. */
function toDirectoryItem(row: Record<string, unknown>): AlumniDirectoryItem {
  return {
    id: row.id as string,
    name: row.name as string,
    graduationYear: Number(row.graduation_year),
    graduationProgram: (row.graduation_program as string) ?? "",
    department: (row.department as string) ?? "",
    currentCompany: (row.current_company as string) ?? "",
    currentPosition: (row.current_position as string) ?? "",
    industry: (row.industry as string) ?? "",
    location: (row.location as string) ?? "",
    bio: (row.bio as string) ?? "",
    linkedinUrl: (row.linkedin_url as string) ?? "",
    githubUrl: (row.github_url as string) ?? "",
    offersMentorship: Boolean(row.offers_mentorship),
    mentorshipTopics: (row.mentorship_topics as string) ?? "",
    mentorshipMode: row.mentorship_mode as AlumniDirectoryItem["mentorshipMode"],
    availability: (row.availability as string) ?? "",
    verified: row.verification === "VERIFIED",
  };
}

function toOwnerView(row: Record<string, unknown>) {
  return {
    ...toDirectoryItem(row),
    studentId: (row.student_id as string | null) ?? null,
    visibility: row.visibility as string,
    verification: row.verification as string,
    status: row.status as string,
  };
}

// ---------------------------------------------------------------- directory

export async function directory(filter: {
  q?: string;
  company?: string;
  industry?: string;
  graduationYear?: number;
  department?: string;
  location?: string;
  mentorsOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  const conditions = [`p.status = 'ALUMNI'`, `p.verification = 'VERIFIED'`, `p.visibility = 'PUBLIC'`];
  const params: unknown[] = [];
  if (filter.q) {
    conditions.push(`(u.name ILIKE $${params.length + 1} OR p.current_company ILIKE $${params.length + 1} OR p.current_position ILIKE $${params.length + 1})`);
    params.push(`%${filter.q}%`);
  }
  if (filter.company) {
    conditions.push(`p.current_company ILIKE $${params.length + 1}`);
    params.push(`%${filter.company}%`);
  }
  if (filter.industry) {
    conditions.push(`lower(p.industry) = lower($${params.length + 1})`);
    params.push(filter.industry);
  }
  if (filter.graduationYear !== undefined) {
    conditions.push(`p.graduation_year = $${params.length + 1}`);
    params.push(filter.graduationYear);
  }
  if (filter.department) {
    conditions.push(`p.department ILIKE $${params.length + 1}`);
    params.push(`%${filter.department}%`);
  }
  if (filter.location) {
    conditions.push(`p.location ILIKE $${params.length + 1}`);
    params.push(`%${filter.location}%`);
  }
  if (filter.mentorsOnly) conditions.push(`p.offers_mentorship = true`);
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const rows = await query(
    `${PROFILE_SELECT} WHERE ${conditions.join(" AND ")}
     ORDER BY u.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  const count = await query(
    `SELECT count(*)::int AS n FROM alumni_profiles p JOIN users u ON u.id = p.user_id WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return { items: rows.map(toDirectoryItem), total: Number(count[0]?.n ?? 0), page, limit };
}

export async function getDirectoryProfile(id: string) {
  const rows = await query(
    `${PROFILE_SELECT} WHERE p.id = $1 AND p.status = 'ALUMNI' AND p.verification = 'VERIFIED' AND p.visibility = 'PUBLIC'`,
    [id],
  );
  if (rows.length === 0) throw ApiError.notFound("Alumni profile not found");
  return toDirectoryItem(rows[0]);
}

export async function getMyProfile(userId: string) {
  const row = await requireAlumniProfile(userId);
  return toOwnerView(row);
}

export async function updateMyProfile(userId: string, updates: Record<string, unknown>) {
  const allowed = [
    "current_company", "current_position", "industry", "location", "bio", "linkedin_url",
    "github_url", "offers_mentorship", "mentorship_topics", "mentorship_mode", "availability", "visibility",
  ] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(typeof updates[key] === "string" ? (updates[key] as string).trim() : updates[key]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  const profile = await requireAlumniProfile(userId);
  params.push(profile.id);
  const updated = await query(
    `UPDATE alumni_profiles SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`,
    params,
  );
  if (updated.length === 0) throw ApiError.notFound("Alumni profile not found");
  const joined = await query(`${PROFILE_SELECT} WHERE p.id = $1`, [profile.id]);
  return toOwnerView(joined[0]);
}

// ---------------------------------------------------------------- mentorship

function mapMentorship(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    alumniId: row.alumni_id as string,
    alumniName: (row.alumni_name as string) ?? "",
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    topic: row.topic as string,
    message: (row.message as string) ?? "",
    status: row.status as MentorshipStatus,
    requestedAt: new Date(row.requested_at as string).toISOString(),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at as string).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
  };
}

const MENTORSHIP_SELECT = `
  SELECT m.*, au.name AS alumni_name, st.student_no, u.name AS student_name
  FROM alumni_mentorships m
  JOIN alumni_profiles ap ON ap.id = m.alumni_id
  JOIN users au ON au.id = ap.user_id
  JOIN students st ON st.id = m.student_id
  JOIN users u ON u.id = st.user_id
`;

export async function requestMentorship(userId: string, alumniId: string, topic: string, message: string) {
  const profileId = await requireStudentProfile(userId);
  const mentor = await queryOne<{ id: string }>(
    `SELECT id FROM alumni_profiles WHERE id = $1 AND status = 'ALUMNI' AND verification = 'VERIFIED' AND offers_mentorship = true`,
    [alumniId],
  );
  if (!mentor) throw ApiError.notFound("Mentor not found or not offering mentorship");
  try {
    const rows = await query(
      `INSERT INTO alumni_mentorships (alumni_id, student_id, topic, message) VALUES ($1, $2, $3, $4) RETURNING *`,
      [alumniId, profileId, topic.trim(), message.trim()],
    );
    return rows[0];
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw ApiError.conflict("You already have a live mentorship request with this mentor", "DUPLICATE_RESOURCE");
    }
    throw error;
  }
}

export async function listMyMentorshipsAsStudent(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`${MENTORSHIP_SELECT} WHERE m.student_id = $1 ORDER BY m.requested_at DESC LIMIT 100`, [profileId]);
  return rows.map(mapMentorship);
}

export async function listMyMentorshipsAsAlumni(userId: string) {
  const profile = await requireAlumniProfile(userId);
  const rows = await query(`${MENTORSHIP_SELECT} WHERE m.alumni_id = $1 ORDER BY m.requested_at DESC LIMIT 100`, [profile.id]);
  return rows.map(mapMentorship);
}

export async function cancelMentorshipAsStudent(userId: string, mentorshipId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `UPDATE alumni_mentorships SET status = 'CANCELLED'
     WHERE id = $1 AND student_id = $2 AND status IN ('REQUESTED', 'ACCEPTED') RETURNING *`,
    [mentorshipId, profileId],
  );
  if (rows.length === 0) throw ApiError.notFound("Cancellable mentorship not found");
  return rows[0];
}

export async function updateMentorshipAsAlumni(userId: string, mentorshipId: string, to: MentorshipStatus) {
  const profile = await requireAlumniProfile(userId);
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM alumni_mentorships WHERE id = $1 FOR UPDATE`, [mentorshipId]);
    if (found.rows.length === 0 || (found.rows[0].alumni_id as string) !== (profile.id as string)) {
      throw ApiError.notFound("Mentorship not found");
    }
    const from = found.rows[0].status as MentorshipStatus;
    if (!MENTORSHIP_TRANSITIONS[from].includes(to) || (to !== "ACCEPTED" && to !== "REJECTED" && to !== "COMPLETED" && to !== "CANCELLED")) {
      throw ApiError.badRequest(`Cannot move mentorship from ${from} to ${to}`, "INVALID_TRANSITION");
    }
    const stamp = to === "ACCEPTED" ? `, accepted_at = now()` : to === "COMPLETED" ? `, completed_at = now()` : "";
    const updated = await client.query(
      `UPDATE alumni_mentorships SET status = $1${stamp} WHERE id = $2 RETURNING *`,
      [to, mentorshipId],
    );
    return updated.rows[0];
  });
}

export async function adminListMentorships(status?: string) {
  const rows = await query(
    `${MENTORSHIP_SELECT} ${status ? `WHERE m.status = $1` : ""} ORDER BY m.requested_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return rows.map(mapMentorship);
}

// -------------------------------------------------------------------- events

const EVENT_SELECT = `
  SELECT e.*, u.name AS creator_name,
         (SELECT count(*)::int FROM alumni_event_registrations r WHERE r.event_id = e.id AND r.status = 'REGISTERED') AS registered_count
  FROM alumni_events e LEFT JOIN users u ON u.id = e.created_by
`;

function mapEvent(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    eventType: row.event_type as string,
    location: (row.location as string) ?? "",
    startsAt: new Date(row.starts_at as string).toISOString(),
    endsAt: row.ends_at ? new Date(row.ends_at as string).toISOString() : null,
    capacity: Number(row.capacity),
    registeredCount: Number(row.registered_count ?? 0),
    audience: row.audience as EventAudience,
    status: row.status as string,
  };
}

export async function listEvents(viewerRole: string, status?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (viewerRole !== "ADMIN") {
    conditions.push(`e.status IN ('PUBLISHED', 'CLOSED', 'COMPLETED')`);
  } else if (status) {
    conditions.push(`e.status = $${params.length + 1}`);
    params.push(status);
  }
  const rows = await query(
    `${EVENT_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY e.starts_at ASC LIMIT 200`,
    params,
  );
  return rows.map(mapEvent);
}

export async function getEvent(id: string, viewerRole: string) {
  const rows = await query(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
  if (rows.length === 0) throw ApiError.notFound("Event not found");
  if (viewerRole !== "ADMIN" && !["PUBLISHED", "CLOSED", "COMPLETED"].includes(rows[0].status as string)) {
    throw ApiError.notFound("Event not found");
  }
  return mapEvent(rows[0]);
}

const EVENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["CLOSED", "CANCELLED", "COMPLETED"],
  CLOSED: ["COMPLETED", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export async function createEvent(creatorId: string, input: {
  title: string; description?: string; eventType?: string; location?: string;
  startsAt: string; endsAt?: string | null; capacity?: number; audience?: string;
}) {
  const starts = new Date(input.startsAt);
  if (Number.isNaN(starts.getTime())) throw ApiError.badRequest("Invalid start time", "VALIDATION_ERROR");
  let ends: Date | null = null;
  if (input.endsAt) {
    ends = new Date(input.endsAt);
    if (Number.isNaN(ends.getTime()) || ends < starts) throw ApiError.badRequest("Invalid end time", "VALIDATION_ERROR");
  }
  const rows = await query(
    `INSERT INTO alumni_events (title, description, event_type, location, starts_at, ends_at, capacity, audience, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.title.trim(), input.description?.trim() ?? "", input.eventType ?? "MEET",
      input.location?.trim() ?? "", starts.toISOString(), ends ? ends.toISOString() : null,
      input.capacity ?? 100, input.audience ?? "ALL", creatorId,
    ],
  );
  const detail = await query(`${EVENT_SELECT} WHERE e.id = $1`, [rows[0].id]);
  return mapEvent(detail[0]);
}

export async function updateEvent(id: string, updates: Record<string, unknown>) {
  const current = await queryOne<{ status: string }>(`SELECT status FROM alumni_events WHERE id = $1`, [id]);
  if (!current) throw ApiError.notFound("Event not found");
  if (updates.status !== undefined && !EVENT_TRANSITIONS[current.status].includes(updates.status as string)) {
    throw ApiError.badRequest(`Cannot move event from ${current.status} to ${updates.status}`, "INVALID_TRANSITION");
  }
  const allowed = ["title", "description", "location", "starts_at", "ends_at", "capacity", "audience", "status"] as const;
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
  const rows = await query(`UPDATE alumni_events SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`, params);
  if (rows.length === 0) throw ApiError.notFound("Event not found");
  const detail = await query(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
  return mapEvent(detail[0]);
}

function audienceAllows(audience: string, role: string): boolean {
  if (audience === "ALL") return true;
  if (audience === "STUDENTS") return role === "STUDENT";
  if (audience === "ALUMNI") return role === "ALUMNI";
  return false;
}

export async function registerForEvent(userId: string, role: string, eventId: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM alumni_events WHERE id = $1 FOR UPDATE`, [eventId]);
    if (found.rows.length === 0) throw ApiError.notFound("Event not found");
    const event = found.rows[0];
    if (event.status !== "PUBLISHED") throw ApiError.badRequest("Event is not open for registration", "VALIDATION_ERROR");
    if (!audienceAllows(event.audience as string, role) && role !== "ADMIN") {
      throw ApiError.forbidden("You are not eligible for this event");
    }
    const count = await client.query(
      `SELECT count(*)::int AS n FROM alumni_event_registrations WHERE event_id = $1 AND status = 'REGISTERED'`,
      [eventId],
    );
    if (Number(count.rows[0]?.n ?? 0) >= Number(event.capacity)) {
      throw ApiError.conflict("Event is at full capacity", "EVENT_FULL");
    }
    try {
      const inserted = await client.query(
        `INSERT INTO alumni_event_registrations (event_id, user_id) VALUES ($1, $2) RETURNING *`,
        [eventId, userId],
      );
      return inserted.rows[0];
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw ApiError.conflict("You are already registered for this event", "DUPLICATE_RESOURCE");
      }
      throw error;
    }
  });
}

export async function cancelRegistration(userId: string, eventId: string) {
  const rows = await query(
    `UPDATE alumni_event_registrations SET status = 'CANCELLED'
     WHERE event_id = $1 AND user_id = $2 AND status = 'REGISTERED' RETURNING *`,
    [eventId, userId],
  );
  if (rows.length === 0) throw ApiError.notFound("Active registration not found");
  return rows[0];
}

export async function myRegistrations(userId: string) {
  const rows = await query(
    `SELECT r.*, e.title AS event_title, e.starts_at, e.location FROM alumni_event_registrations r
     JOIN alumni_events e ON e.id = r.event_id
     WHERE r.user_id = $1 ORDER BY e.starts_at ASC LIMIT 100`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    eventId: row.event_id as string,
    eventTitle: row.event_title as string,
    startsAt: new Date(row.starts_at as string).toISOString(),
    location: (row.location as string) ?? "",
    status: row.status as string,
  }));
}

export async function eventRegistrations(eventId: string) {
  const rows = await query(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM alumni_event_registrations r JOIN users u ON u.id = r.user_id
     WHERE r.event_id = $1 ORDER BY r.registered_at ASC LIMIT 500`,
    [eventId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    userName: row.user_name as string,
    userRole: row.user_role as string,
    status: row.status as string,
    registeredAt: new Date(row.registered_at as string).toISOString(),
  }));
}

export async function markAttendance(registrationId: string) {
  const rows = await query(
    `UPDATE alumni_event_registrations SET status = 'ATTENDED'
     WHERE id = $1 AND status = 'REGISTERED' RETURNING *`,
    [registrationId],
  );
  if (rows.length === 0) throw ApiError.notFound("Active registration not found");
  return rows[0];
}

// --------------------------------------------------------------- campaigns

export async function listCampaigns(viewerRole: string) {
  const rows = await query(
    `SELECT c.*,
            COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'RECORDED'), 0) AS recorded_total,
            COUNT(t.id) FILTER (WHERE t.status = 'RECORDED')::int AS contribution_count
     FROM alumni_campaigns c LEFT JOIN alumni_contributions t ON t.campaign_id = c.id
     ${viewerRole === "ADMIN" ? "" : "WHERE c.status = 'ACTIVE'"}
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    targetAmount: Number(row.target_amount),
    recordedTotal: Number(row.recorded_total ?? 0),
    contributionCount: Number(row.contribution_count ?? 0),
    status: row.status as string,
    startDate: toLocalDateString(row.start_date as string),
    endDate: row.end_date ? toLocalDateString(row.end_date as string) : null,
  }));
}

export async function createCampaign(creatorId: string, input: { title: string; description?: string; targetAmount: number; startDate?: string; endDate?: string | null }) {
  const rows = await query(
    `INSERT INTO alumni_campaigns (title, description, target_amount, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.title.trim(), input.description?.trim() ?? "", input.targetAmount, input.startDate ?? new Date().toISOString().slice(0, 10), input.endDate ?? null, creatorId],
  );
  return rows[0];
}

export async function updateCampaign(id: string, updates: Record<string, unknown>) {
  const allowed = ["title", "description", "target_amount", "end_date", "status"] as const;
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
  const rows = await query(`UPDATE alumni_campaigns SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Campaign not found");
  return rows[0];
}

export async function recordContribution(actor: { id: string; role: string }, campaignId: string, amount: number, currency: string, reference: string) {
  const campaign = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM alumni_campaigns WHERE id = $1`,
    [campaignId],
  );
  if (!campaign) throw ApiError.notFound("Campaign not found");
  if (campaign.status !== "ACTIVE" && actor.role !== "ADMIN") {
    throw ApiError.badRequest("Campaign is not accepting contributions", "VALIDATION_ERROR");
  }
  let alumniId: string | null = null;
  let status = "RECORDED";
  if (actor.role === "ALUMNI") {
    const profile = await requireAlumniProfile(actor.id);
    alumniId = profile.id as string;
    status = "PLEDGED";
  } else if (actor.role === "ADMIN") {
    // Admin records on behalf: alumni linkage optional via reference note.
    const linked = await queryOne<{ id: string }>(
      `SELECT id FROM alumni_profiles WHERE user_id = $1`,
      [actor.id],
    );
    alumniId = linked?.id ?? null;
    status = "RECORDED";
    if (!alumniId) {
      // Record against the earliest verified profile is wrong; require explicit alumni.
      throw ApiError.badRequest("Admin contributions need an alumni profile — record via pledge flow instead", "VALIDATION_ERROR");
    }
  } else {
    throw ApiError.forbidden("Only alumni and administrators record contributions");
  }
  const rows = await query(
    `INSERT INTO alumni_contributions (campaign_id, alumni_id, amount, currency, status, reference)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [campaignId, alumniId, amount, currency.trim() || "INR", status, reference.trim()],
  );
  return rows[0];
}

export async function updateContribution(id: string, status: string) {
  const rows = await query(`UPDATE alumni_contributions SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
  if (rows.length === 0) throw ApiError.notFound("Contribution not found");
  return rows[0];
}

export async function listContributions(campaignId?: string) {
  const rows = await query(
    `SELECT t.*, u.name AS alumni_name FROM alumni_contributions t
     JOIN alumni_profiles ap ON ap.id = t.alumni_id JOIN users u ON u.id = ap.user_id
     ${campaignId ? `WHERE t.campaign_id = $1` : ""} ORDER BY t.created_at DESC LIMIT 200`,
    campaignId ? [campaignId] : [],
  );
  return rows.map((row) => ({
    id: row.id as string,
    campaignId: row.campaign_id as string,
    alumniName: row.alumni_name as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    status: row.status as string,
    reference: (row.reference as string) ?? "",
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export async function myContributions(userId: string) {
  const profile = await requireAlumniProfile(userId);
  const rows = await query(
    `SELECT t.*, c.title AS campaign_title FROM alumni_contributions t
     JOIN alumni_campaigns c ON c.id = t.campaign_id
     WHERE t.alumni_id = $1 ORDER BY t.created_at DESC LIMIT 100`,
    [profile.id],
  );
  return rows.map((row) => ({
    id: row.id as string,
    campaignTitle: row.campaign_title as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    status: row.status as string,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

// ---------------------------------------------------------------- analytics

export async function alumniAnalytics() {
  const [counts, byYear, byDept, byIndustry, mentorship, events] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE verification = 'VERIFIED')::int AS verified,
                  COUNT(*) FILTER (WHERE offers_mentorship = true AND status = 'ALUMNI')::int AS mentors
           FROM alumni_profiles`),
    query(`SELECT graduation_year, COUNT(*)::int AS n FROM alumni_profiles
           WHERE status = 'ALUMNI' GROUP BY graduation_year ORDER BY graduation_year DESC LIMIT 20`),
    query(`SELECT department, COUNT(*)::int AS n FROM alumni_profiles
           WHERE status = 'ALUMNI' AND department <> '' GROUP BY department ORDER BY n DESC LIMIT 20`),
    query(`SELECT industry, COUNT(*)::int AS n FROM alumni_profiles
           WHERE status = 'ALUMNI' AND industry <> '' GROUP BY industry ORDER BY n DESC LIMIT 20`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'REQUESTED')::int AS requested,
                  COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS active,
                  COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
           FROM alumni_mentorships`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int AS published_events,
                  (SELECT COUNT(*)::int FROM alumni_event_registrations WHERE status = 'REGISTERED') AS registrations,
                  (SELECT COALESCE(SUM(amount), 0) FROM alumni_contributions WHERE status = 'RECORDED') AS recorded_total
           FROM alumni_events`),
  ]);
  return {
    total: Number(counts[0]?.total ?? 0),
    verified: Number(counts[0]?.verified ?? 0),
    mentors: Number(counts[0]?.mentors ?? 0),
    byGraduationYear: byYear.map((r) => ({ year: Number(r.graduation_year), count: Number(r.n) })),
    byDepartment: byDept.map((r) => ({ department: r.department as string, count: Number(r.n) })),
    byIndustry: byIndustry.map((r) => ({ industry: r.industry as string, count: Number(r.n) })),
    mentorship: {
      requested: Number(mentorship[0]?.requested ?? 0),
      active: Number(mentorship[0]?.active ?? 0),
      completed: Number(mentorship[0]?.completed ?? 0),
    },
    publishedEvents: Number(events[0]?.published_events ?? 0),
    eventRegistrations: Number(events[0]?.registrations ?? 0),
    recordedContributions: Number(events[0]?.recorded_total ?? 0),
  };
}

// ------------------------------------------------------------------- admin

export async function adminListProfiles(status?: string, verification?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) {
    conditions.push(`p.status = $${params.length + 1}`);
    params.push(status);
  }
  if (verification) {
    conditions.push(`p.verification = $${params.length + 1}`);
    params.push(verification);
  }
  const rows = await query(
    `${PROFILE_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY u.name ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => toOwnerView(row));
}

export async function adminUpdateProfile(id: string, updates: Record<string, unknown>) {
  const selfFields = [
    "current_company", "current_position", "industry", "location", "bio", "linkedin_url",
    "github_url", "offers_mentorship", "mentorship_topics", "mentorship_mode", "availability", "visibility",
  ] as const;
  const adminFields = ["verification", "status", "graduation_year", "graduation_program", "department"] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of [...selfFields, ...adminFields]) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(typeof updates[key] === "string" ? (updates[key] as string).trim() : updates[key]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE alumni_profiles SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`, params);
  if (rows.length === 0) throw ApiError.notFound("Alumni profile not found");
  const joined = await query(`${PROFILE_SELECT} WHERE p.id = $1`, [id]);
  return toOwnerView(joined[0]);
}

// ------------------------------------------------- alumni dashboard summary

export async function alumniDashboard(userId: string) {
  const profile = await requireAlumniProfile(userId);
  const profileId = profile.id as string;
  const [incoming, mine, events, contributions] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM alumni_mentorships WHERE alumni_id = $1 AND status = 'REQUESTED'`, [profileId]),
    query(`SELECT count(*)::int AS n FROM alumni_mentorships WHERE alumni_id = $1 AND status = 'ACCEPTED'`, [profileId]),
    query(
      `SELECT e.id, e.title, e.starts_at, e.location FROM alumni_events e
       WHERE e.status = 'PUBLISHED' AND e.starts_at > now() ORDER BY e.starts_at ASC LIMIT 5`,
    ),
    query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS n FROM alumni_contributions WHERE alumni_id = $1 AND status = 'RECORDED'`, [profileId]),
  ]);
  return {
    pendingRequests: Number(incoming[0]?.n ?? 0),
    activeMentorships: Number(mine[0]?.n ?? 0),
    upcomingEvents: events.map((e) => ({
      id: e.id as string,
      title: e.title as string,
      startsAt: new Date(e.starts_at as string).toISOString(),
      location: (e.location as string) ?? "",
    })),
    contributions: { total: Number(contributions[0]?.total ?? 0), count: Number(contributions[0]?.n ?? 0) },
  };
}
