import type { Role } from "../../utils/roles";

export const AI_INTENTS = [
  "ATTENDANCE",
  "COURSE_ATTENDANCE",
  "FEES",
  "FEE_HISTORY",
  "TIMETABLE",
  "NEXT_CLASS",
  "GENERAL",
] as const;

export type AiIntent = (typeof AI_INTENTS)[number];

/** The only data domains the assistant may cite in a Phase 4 answer. */
export const AI_SOURCES = ["attendance", "fees", "timetable"] as const;

export type AiSource = (typeof AI_SOURCES)[number];

/**
 * The authenticated caller as resolved by requireAuth. Tools never accept an
 * identity from the message or from the model.
 */
export interface AiActor {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Deterministic server-side routing of the user message to a data need. */
export interface IntentRoute {
  intent: AiIntent;
  /** Free-text course reference ("Java", "CS305", "database"), when asked. */
  courseQuery?: string;
  /** Full weekday name for day-scoped timetable questions. */
  day?: string;
  /** "which subject is lowest" style questions. */
  lowest?: boolean;
  /** The message asks about data belonging to somebody else. */
  crossUser: boolean;
}

export interface ToolOutcome {
  sources: AiSource[];
  context: Record<string, unknown>;
  /** True when the retrieval ran but found nothing to answer with. */
  noData: boolean;
}

export interface AiAskResult {
  answer: string;
  intent: AiIntent;
  sources: AiSource[];
  /** The exact structured context handed to the model (user-scoped, minimized). */
  context: Record<string, unknown>;
  provider: string;
}
