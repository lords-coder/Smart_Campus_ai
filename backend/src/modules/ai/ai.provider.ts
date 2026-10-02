import { env } from "../../config/env";
import type { AiIntent } from "./ai.types";

export type ProviderFailureKind =
  | "config"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "unavailable"
  | "malformed"
  | "empty";

/** Typed provider failure so the service can map it to a SmartCampus error. */
export class AiProviderError extends Error {
  readonly kind: ProviderFailureKind;

  constructor(kind: ProviderFailureKind, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

export interface AiGenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Structured, already-authorized data the model is allowed to use. */
  context: Record<string, unknown>;
  intent: AiIntent;
}

export interface AiGenerateResult {
  text: string;
}

/** Provider abstraction: the AI business logic never imports a vendor SDK. */
export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

const OPENAI_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      timeoutMs: number;
      maxTokens: number;
    },
  ) {}

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!this.config.apiKey) {
      throw new AiProviderError("config", "OPENAI_API_KEY is not configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(OPENAI_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0,
            max_tokens: this.config.maxTokens,
            messages: [
              { role: "system", content: request.systemPrompt },
              {
                role: "user",
                content:
                  `${request.userPrompt}\n\n` +
                  `SmartCampus data (JSON, answer only from this):\n` +
                  JSON.stringify(request.context),
              },
            ],
          }),
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AiProviderError("timeout", "AI provider request timed out");
        }
        throw new AiProviderError("unavailable", `AI provider unreachable: ${String(error)}`);
      }

      if (response.status === 401 || response.status === 403) {
        throw new AiProviderError("auth", "AI provider rejected the API key");
      }
      if (response.status === 429) {
        throw new AiProviderError("rate_limit", "AI provider rate limit reached");
      }
      if (!response.ok) {
        throw new AiProviderError("unavailable", `AI provider responded with ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("malformed", "AI provider returned unreadable JSON");
      }

      const text = extractContent(payload);
      if (text === null) {
        throw new AiProviderError("malformed", "AI provider response had no message content");
      }
      if (text.trim() === "") {
        throw new AiProviderError("empty", "AI provider returned an empty answer");
      }
      return { text: text.trim() };
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractContent(payload: unknown): string | null {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

/**
 * Deterministic offline provider used when no API key is configured
 * (`AI_PROVIDER=auto` without a key, or `AI_PROVIDER=mock`). It renders the
 * same structured context a real model would receive, which keeps local
 * development, API tests and E2E tests independent of an external service.
 *
 * Sentinel phrases let the test suite exercise the provider failure paths
 * without a live key: "simulate provider failure" / "simulate provider timeout".
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const probe = request.userPrompt.toLowerCase();
    if (probe.includes("simulate provider failure")) {
      throw new AiProviderError("unavailable", "Simulated provider failure");
    }
    if (probe.includes("simulate provider timeout")) {
      throw new AiProviderError("timeout", "Simulated provider timeout");
    }
    return { text: renderMockAnswer(request.intent, request.context, request.userPrompt) };
  }
}

export function createProvider(): AiProvider {
  const configured = env.ai.provider;
  if (configured === "mock") return new MockProvider();
  if (configured === "openai") return new OpenAiProvider({ apiKey: env.ai.apiKey, model: env.ai.model, timeoutMs: env.ai.timeoutMs, maxTokens: env.ai.maxTokens });
  // auto: real provider when a key exists, deterministic mock otherwise.
  return env.ai.apiKey
    ? new OpenAiProvider({ apiKey: env.ai.apiKey, model: env.ai.model, timeoutMs: env.ai.timeoutMs, maxTokens: env.ai.maxTokens })
    : new MockProvider();
}

// ---------------------------------------------------------------- mock render

function money(value: number): string {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

function pct(value: unknown): string {
  return `${value}%`;
}

interface MockCourse {
  code?: string;
  name?: string;
  percentage?: number;
  present?: number;
  late?: number;
  absent?: number;
  total?: number;
}

function courseLabel(course: MockCourse | undefined): string {
  if (!course) return "that course";
  return [course.code, course.name].filter(Boolean).join(" ");
}

function renderMockAnswer(
  intent: AiIntent,
  context: Record<string, unknown>,
  userPrompt: string,
): string {
  const scopeNote = typeof context.scopeNote === "string" ? `${context.scopeNote} ` : "";
  const body = renderBody(intent, context, userPrompt);
  return `${scopeNote}${body}`.trim();
}

function renderBody(intent: AiIntent, context: Record<string, unknown>, userPrompt: string): string {
  switch (intent) {
    case "ATTENDANCE":
      return renderAttendance(context);
    case "COURSE_ATTENDANCE":
      return renderCourseAttendance(context);
    case "FEES":
      return renderFees(context);
    case "FEE_HISTORY":
      return renderFeeHistory(context);
    case "TIMETABLE":
      return renderTimetable(context);
    case "NEXT_CLASS":
      return renderNextClass(context);
    default:
      return renderGeneral(context, userPrompt);
  }
}

interface MockClassAttendance {
  course?: MockCourse;
  day?: string;
  date?: string;
  students?: number;
  recorded?: number;
  present?: number;
  absent?: number;
}

function renderClassAttendance(results: MockClassAttendance[]): string {
  const parts = results.slice(0, 3).map((entry) => {
    const label = courseLabel(entry.course);
    const when = entry.date ? `${entry.date}` : entry.day ?? "";
    return `${label} on ${when}: ${entry.recorded ?? 0} of ${entry.students ?? 0} students marked (${entry.present ?? 0} present, ${entry.absent ?? 0} absent)`;
  });
  return parts.join(". ") + ".";
}

function renderAttendance(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const classAttendance = context.classAttendance as MockClassAttendance[] | undefined;
  if (Array.isArray(classAttendance) && classAttendance.length > 0) {
    return `Attendance recorded for your classes. ${renderClassAttendance(classAttendance)}`;
  }

  const attendance = context.attendance as
    | { overall?: { percentage?: number; present?: number; late?: number; total?: number }; byCourse?: MockCourse[] }
    | undefined;
  const overall = attendance?.overall;
  if (!overall) return "Attendance information is unavailable right now.";

  const attended = Number(overall.present ?? 0) + Number(overall.late ?? 0);
  const line = `Your overall attendance is ${pct(overall.percentage)} (${attended} of ${overall.total} recorded classes).`;

  const byCourse = attendance?.byCourse ?? [];
  if (byCourse.length === 0) return line;

  const lowest = [...byCourse]
    .filter((course) => typeof course.percentage === "number")
    .sort((a, b) => Number(a.percentage) - Number(b.percentage))[0];
  if (lowest) {
    return `${line} Your lowest attendance is ${courseLabel(lowest)} at ${pct(lowest.percentage)}.`;
  }
  return line;
}

function renderCourseAttendance(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const classAttendance = context.classAttendance as MockClassAttendance[] | undefined;
  if (Array.isArray(classAttendance) && classAttendance.length > 0) {
    return `Attendance for your class. ${renderClassAttendance(classAttendance)}`;
  }

  const attendance = context.attendance as { course?: MockCourse } | undefined;
  const course = attendance?.course;
  if (!course || typeof course.percentage !== "number") {
    return "Attendance information for that course is unavailable.";
  }
  const attended = Number(course.present ?? 0) + Number(course.late ?? 0);
  return `Your attendance in ${courseLabel(course)} is ${pct(course.percentage)} (${attended} of ${course.total} recorded classes).`;
}

function renderFees(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const fees = context.fees as
    | { totalPending?: number; totalPaid?: number; nextDue?: { feeType?: string; amount?: number; dueDate?: string } | null }
    | undefined;
  if (!fees) {
    const register = context.feeRegister as { summary?: { totalOutstanding?: number; openFeeCount?: number; feeCount?: number } } | undefined;
    if (register?.summary) {
      return `The institute fee register holds ${register.summary.feeCount} fee records with ${money(register.summary.totalOutstanding ?? 0)} outstanding across ${register.summary.openFeeCount} open records.`;
    }
    return "Fee information is unavailable.";
  }

  const pending = Number(fees.totalPending ?? 0);
  if (pending <= 0) {
    return `Nothing is pending on your account — ${money(fees.totalPaid ?? 0)} paid in total.`;
  }
  const openCount = (context.fees as { records?: unknown[] })?.records?.length ?? 0;
  const due = fees.nextDue;
  const dueLine = due?.feeType ? ` Next due: ${due.feeType} ${money(due.amount ?? 0)} by ${due.dueDate}.` : "";
  return `You have ${money(pending)} pending across ${openCount} fee record${openCount === 1 ? "" : "s"}.${dueLine}`;
}

function renderFeeHistory(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const history = context.feePayments as
    | { paymentCount?: number; totalPaid?: number; payments?: Array<{ amount?: number; feeType?: string; paymentMethod?: string; recordedAt?: string }> }
    | undefined;
  if (!history || !history.paymentCount) return "No payments are recorded on your account yet.";

  const payments = history.payments ?? [];
  const latest = payments[0];
  const latestLine = latest
    ? ` Latest: ${money(latest.amount ?? 0)} for ${latest.feeType ?? "a fee"} by ${latest.paymentMethod ?? "an accepted method"} on ${String(latest.recordedAt ?? "").slice(0, 10)}.`
    : "";
  return `You have ${history.paymentCount} payment${history.paymentCount === 1 ? "" : "s"} totalling ${money(history.totalPaid ?? 0)}.${latestLine}`;
}

function renderTimetable(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const timetable = context.timetable as
    | { day?: string; classCount?: number; classes?: Array<{ startTime?: string; room?: string; section?: string; course?: MockCourse }> }
    | undefined;
  const schedule = context.classSchedule as
    | { total?: number; day?: string; classCount?: number; classes?: Array<{ startTime?: string; room?: string; section?: string; course?: MockCourse }> }
    | undefined;

  // Admin questions carry `classSchedule` (institute-wide), personal ones `timetable`.
  const institute = !timetable && schedule !== undefined;
  const classes = timetable?.classes ?? schedule?.classes ?? [];
  const day = timetable?.day ?? schedule?.day ?? "that day";
  const count = timetable?.classCount ?? schedule?.classCount ?? classes.length;

  if (classes.length === 0 && schedule?.total !== undefined) {
    return `The institute timetable holds ${schedule.total} active entries.`;
  }
  if (count === 0) {
    return institute ? `There are no classes scheduled on ${day}.` : `You have no classes scheduled on ${day}.`;
  }

  const first = classes[0];
  const label = first ? `${courseLabel(first.course)} at ${first.startTime} in ${first.room}` : "";
  if (institute) {
    return `There are ${count} classes scheduled on ${day}. First: ${label}.`;
  }
  return `You have ${count} ${count === 1 ? "class" : "classes"} on ${day}. First: ${label}.`;
}

function renderNextClass(context: Record<string, unknown>): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const next = context.nextClass as
    | { day?: string; date?: string; startTime?: string; room?: string; section?: string; course?: MockCourse }
    | undefined;
  if (!next) return "You have no class coming up in the scheduled week.";

  return `Your next class is ${courseLabel(next.course)} on ${next.day} at ${next.startTime} in ${next.room} (Section ${next.section}).`;
}

function renderGeneral(context: Record<string, unknown>, userPrompt: string): string {
  const note = context.note;
  if (typeof note === "string") return note;

  const text = userPrompt.toLowerCase();
  const restricted =
    /(password|secret|api key|system prompt|credentials|raw sql|database connection|ignore (your|previous|all) instructions|show me all (students|users)|disable authorization)/.test(
      text,
    );
  if (restricted) {
    return "I can't share system instructions, credentials or internal data, and I can't show other people's records. I'm SmartCampus AI, a campus-data assistant for your own attendance, fees and timetable.";
  }
  return "I'm SmartCampus AI, the campus assistant for attendance, fees and timetable questions. Ask me something like \"What's my attendance?\", \"How much fee do I have pending?\" or \"When is my next class?\"";
}
