"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Compass,
  FileCheck2,
  GraduationCap,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/components/providers/auth-provider";
import { ConnectionState } from "@/components/command-center/connection-state";
import { DataSummaryCard } from "@/components/command-center/data-summary-card";
import { SectionHeading } from "@/components/command-center/section-heading";
import { TrackingStatusLine } from "@/components/command-center/tracking-status-line";
import { formatCurrency, formatTime } from "@/lib/format";
import type {
  AttendanceSummary,
  FeesSummary,
  LibraryFineSummary,
  MyTransport,
  PerformancePrediction,
  RecommendationsResponse,
  StudentPerformanceFeatures,
  TimetableDay,
} from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Live", "Degraded" or "Unavailable" for a single API-backed panel. */
function panelState(
  data: unknown,
  loading: boolean,
  error: string | null,
  live: string,
  down: string,
): { status: string; degraded: boolean } {
  if (loading) return { status: "Loading", degraded: false };
  if (error) return { status: down, degraded: true };
  if (data === null || data === undefined) return { status: down, degraded: true };
  return { status: live, degraded: false };
}

export function CommandCenter() {
  const { user } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "there";

  const attendance = useApi<AttendanceSummary>("/students/me/attendance-summary");
  const fees = useApi<FeesSummary>("/students/me/fees-summary");
  const timetable = useApi<TimetableDay>("/students/me/timetable");
  const performance = useApi<PerformancePrediction>("/performance/predict");
  const features = useApi<StudentPerformanceFeatures>("/performance");
  const recommendations = useApi<RecommendationsResponse>("/recommendations");
  const transport = useApi<MyTransport>("/transport/me");
  const fines = useApi<LibraryFineSummary>("/library/my-fines");

  const attendancePct = attendance.data?.overall.percentage;
  const prediction = performance.data;
  const mlServed = prediction?.prediction_source === "ML" && prediction.is_model_prediction;
  const predictionStatus = prediction
    ? mlServed
      ? "Live model"
      : "Rule-based estimate"
    : performance.loading
      ? "Checking prediction"
      : "Prediction unavailable";
  const predictionStatusDetail = prediction
    ? mlServed
      ? `Trained model ${prediction.model_version}`
      : "Threshold estimate · not model confidence"
    : performance.error
      ? "The performance service could not be reached"
      : performance.loading
        ? "Loading your academic outlook"
        : "No performance prediction was returned";
  const recs = recommendations.data?.recommendations ?? [];
  const summary = recommendations.data?.summary;
  const entries = timetable.data?.entries ?? [];
  const overdueCount = (fines.data?.accruing ?? []).length;
  const hasTransport = Boolean(transport.data?.assignment);

  const servicesDescription = transport.loading
    ? "Checking your assigned route…"
    : transport.error
      ? `Transport unavailable: ${transport.error}`
      : hasTransport
        ? fines.loading
          ? `${transport.data?.assignment?.route.name} · checking library fines…`
          : fines.error
            ? `${transport.data?.assignment?.route.name} · library fine summary unavailable`
            : overdueCount > 0
              ? `Library fine outstanding · ${formatCurrency(fines.data?.totalBalance ?? 0)}`
              : "No library fines outstanding"
        : "No bus route assigned to you";

  // --- Academic snapshot cards (all figures come from the API) ---
  const cards: Array<DataSummaryCardProps> = [
    {
      title: "Overall attendance",
      description:
        attendance.data?.overall.total
          ? `${attendance.data.overall.present} present of ${attendance.data.overall.total} classes`
          : "No attendance records yet",
      icon: CalendarDays,
      accent: "aqua",
      value: attendancePct === undefined ? "—" : `${attendancePct}%`,
      ...panelState(attendance.data, attendance.loading, attendance.error, "Live", "Unavailable"),
    },
    {
      title: "Pending fees",
      description: fees.data?.nextDue
        ? `Next due ${formatCurrency(fees.data.nextDue.amount)} · ${fees.data.nextDue.dueDate}`
        : "No upcoming fee deadline",
      icon: WalletCards,
      accent: "blue",
      value: formatCurrency(fees.data?.totalPending ?? 0),
      ...panelState(fees.data, fees.loading, fees.error, "Live", "Unavailable"),
    },
    {
      title: "Academic outlook",
      description: prediction
        ? mlServed
          ? `Model confidence: ${Math.round(prediction.confidence * 100)}% · trained model ${prediction.model_version}`
          : "Rule-based threshold estimate · not model confidence"
        : "Performance prediction is not available right now",
      icon: ChartNoAxesCombined,
      accent: "violet",
      value: prediction?.category ?? "—",
      ...panelState(
        prediction,
        performance.loading,
        performance.error,
        mlServed ? `ML model · ${prediction.model_version}` : "Rule-based estimate",
        "Unavailable",
      ),
    },
    {
      title: "Campus services",
      description: servicesDescription,
      icon: Compass,
      accent: "aqua",
      value: hasTransport ? (transport.data?.assignment?.vehicle?.registrationNumber ?? "Assigned") : "—",
      ...panelState(
        transport.data,
        transport.loading,
        transport.error,
        hasTransport ? "Demo tracking" : "No route",
        "Unavailable",
      ),
    },
  ];

  const insightTitle = prediction
    ? mlServed
      ? `Modelled as ${prediction.category}`
      : `Rule-based band: ${prediction.category}`
    : "Insight unavailable";
  const insightBody = prediction
    ? (mlServed
        ? `${Math.round(prediction.confidence * 100)}% model confidence across ${Object.keys(prediction.probabilities).length} model classes. `
        : "This threshold-based estimate is not a trained-model prediction or confidence score. ") +
      (summary && summary.coursesNeedingAttention > 0
        ? `${summary.coursesNeedingAttention} course${summary.coursesNeedingAttention === 1 ? "" : "s"} flagged for attention.`
        : "No courses are currently flagged for attention.")
    : "The performance model could not be reached from this browser session.";

  const nextSteps = [
    {
      icon: BookOpenText,
      label: "Learning plan",
      title: recs.length > 0 ? `${recs.length} recommendation${recs.length === 1 ? "" : "s"} ready` : "No recommendations",
      copy:
        recs.length > 0
          ? recs[0].reason
          : "No recommendations were returned for your current academic record.",
      accent: "aqua" as const,
      href: "/recommendations",
      badge: recs.length > 0 ? `${summary?.highPriority ?? 0} high` : "Clear",
    },
    {
      icon: FileCheck2,
      label: "Academic record",
      title: features.data ? "Assessments and assignments" : "Record unavailable",
      copy: features.data
        ? `${features.data.total_assessments} assessments · ${features.data.assignment_submission_rate}% assignment submission rate`
        : "Your academic record could not be loaded.",
      accent: "blue" as const,
      href: "/performance",
      badge: features.data ? `${features.data.avg_assignment_score}% score` : "—",
    },
    {
      icon: Clock3,
      label: "Next on your schedule",
      title: entries.length > 0
        ? entries[0].course.name
        : timetable.error
          ? "Schedule unavailable"
          : timetable.loading
            ? "Loading schedule"
            : "No class today",
      copy:
        entries.length > 0
          ? `${entries[0].course.code} · ${formatTime(entries[0].startTime)}–${formatTime(entries[0].endTime)} · room ${entries[0].room}`
          : timetable.error
            ? "Your timetable could not be loaded."
            : "You have no scheduled classes for today.",
      accent: "violet" as const,
      href: "/timetable",
      badge: entries.length > 0 ? `${entries.length} today` : "Free",
    },
  ];

  return (
    <div className="command-center">
      <section className="dashboard-hero" aria-labelledby="page-title">
        <div className="dashboard-hero__copy">
          <div className="page-kicker">
            <span className="page-kicker__line" aria-hidden="true" />
            <span>Student workspace</span>
            <span className="page-kicker__divider" aria-hidden="true">
              /
            </span>
            <span className="page-kicker__muted">Command center</span>
          </div>
          <h1 id="page-title">
            {greeting()}, {firstName}. <span>Your campus, in one clear view.</span>
          </h1>          <p className="dashboard-hero__description">
            Academics, schedule and campus services, read live from SmartCampus.
          </p>
        </div>
        <div className="prototype-status" aria-label={`Academic outlook status: ${predictionStatus}`}>
          <span className="prototype-status__mark" aria-hidden="true">
            <Activity size={15} />
          </span>
          <span>
            <strong>{predictionStatus}</strong>
            <small>{predictionStatusDetail}</small>
          </span>
          <span className="prototype-status__ring" aria-hidden="true" />
        </div>
      </section>

      <section className="snapshot-section" aria-labelledby="snapshot-title">
        <SectionHeading
          eyebrow="Your overview"
          title="Academic snapshot"
          detail="Every figure below is read from your own SmartCampus records."
        />
        <div className="snapshot-grid">
          {cards.map((card) => (
            <DataSummaryCard key={card.title} {...card} />
          ))}
          <article className="insight-card" aria-labelledby="insight-title">
            <div className="insight-card__mesh" aria-hidden="true" />
            <div className="insight-card__head">
              <span className="insight-card__icon">
                <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="insight-card__eyebrow">AI insight</span>
              <span className="insight-card__signal" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
            <h3 id="insight-title">{insightTitle}</h3>
            <p>{insightBody}</p>
            <div className="insight-card__footer">
              <span className="insight-card__dot" aria-hidden="true" />
              {mlServed ? `Trained model ${prediction.model_version}` : "Rule-based band · no model confidence"}
            </div>
          </article>
        </div>
      </section>

      <section className="schedule-insight-grid" aria-label="Schedule and insight">
        <article className="surface-card timetable-card" aria-labelledby="timetable-title">
          <div className="surface-card__header">
            <div>
              <p className="section-eyebrow">Plan your day</p>
              <h2 id="timetable-title">Today&apos;s timetable</h2>
            </div>
            <span className="quiet-status">
              <CalendarDays size={14} aria-hidden="true" />
              {timetable.data?.date ?? "—"}
            </span>
          </div>

          {timetable.loading ? (
            <div className="timetable-note" role="note">
              <span className="timetable-note__icon">
                <Clock3 size={15} aria-hidden="true" />
              </span>
              <p>Loading your schedule…</p>
            </div>
          ) : entries.length === 0 ? (
            <>
              <div className="timetable-note" role="note">
                <span className="timetable-note__icon">
                  <Clock3 size={15} aria-hidden="true" />
                </span>
                <p>
                  {timetable.error
                    ? `Your schedule could not be loaded: ${timetable.error}`
                    : "You have no scheduled classes for today."}
                </p>
              </div>
              <div className="week-canvas" aria-hidden="true">
                <div className="week-days">
                  {WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="week-columns">
                  {WEEKDAYS.map((day, index) => (
                    <div className={`week-column${index === 3 ? " week-column--focus" : ""}`} key={day}>
                      <span />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              </div>
              <div className="schedule-empty-overlay">
                <span className="schedule-empty-overlay__icon">
                  <CalendarDays size={19} aria-hidden="true" />
                </span>
                <strong>Nothing scheduled today</strong>
                <span>Your week is clear for {timetable.data?.day ?? "today"}.</span>
              </div>
            </>
          ) : (
            <ul className="snapshot-list" aria-label="Classes today">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span className="snapshot-list__time">
                    {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                  </span>
                  <span className="snapshot-list__body">
                    <strong>{entry.course.name}</strong>
                    <small>
                      {entry.course.code} · room {entry.room} · section {entry.section}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="timetable-card__footer">
            <span>{entries.length} class{entries.length === 1 ? "" : "es"} today</span>
            <Link href="/timetable">Full timetable</Link>
          </div>
        </article>

        <article className="surface-card insight-panel" aria-labelledby="insight-panel-title">
          <div className="surface-card__header">
            <div>
              <p className="section-eyebrow">Grounded in your university</p>
              <h2 id="insight-panel-title">Recommendations</h2>
            </div>
            <span className="insight-panel__spark">
              <Sparkles size={18} aria-hidden="true" />
            </span>
          </div>
          <div className="insight-panel__body">
            <div className="insight-orbit" aria-hidden="true">
              <span className="insight-orbit__ring insight-orbit__ring--one" />
              <span className="insight-orbit__ring insight-orbit__ring--two" />
              <span className="insight-orbit__core">
                <Sparkles size={20} />
              </span>
              <span className="insight-orbit__node insight-orbit__node--one" />
              <span className="insight-orbit__node insight-orbit__node--two" />
            </div>
            {recommendations.loading ? (
              <ConnectionState
                icon={Sparkles}
                title="Reading your academic record…"
                description="Recommendations are computed from attendance, assessment and assignment data."
                compact
              />
            ) : recommendations.error ? (
              <ConnectionState
                icon={Sparkles}
                title="Recommendations unavailable"
                description={recommendations.error}
                compact
              />
            ) : recs.length === 0 ? (
              <ConnectionState
                icon={Sparkles}
                title="Nothing needs attention."
                description="Your performance is strong across every enrolled course."
                compact
              />
            ) : (
              <ConnectionState
                icon={Sparkles}
                title={`${recs.length} recommendation${recs.length === 1 ? "" : "s"}`}
                description={recs[0].reason}
                compact
              />
            )}
          </div>
          <Link className="secondary-action" href="/recommendations">
            <span>View recommendations</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <p className="disabled-caption">
            {summary
              ? `${summary.highPriority} high · ${summary.mediumPriority} medium · ${summary.coursesNeedingAttention} flagged`
              : "Computed from your own academic records"}
          </p>
        </article>
      </section>

      <section className="recommendations-section" aria-labelledby="recommendations-title">
        <SectionHeading
          eyebrow="Personalized for you"
          title="Next steps"
          detail="Each card links to the live SmartCampus screen it summarises."
          action={<span className="recommendation-count">{recs.length} flagged</span>}
        />
        <div className="recommendation-grid">
          {nextSteps.map(({ icon: Icon, label, title, copy, accent, href, badge }) => (
            <Link className={`recommendation-card recommendation-card--${accent}`} key={label} href={href}>
              <div className="recommendation-card__top">
                <span className="recommendation-card__icon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="recommendation-card__label">{label}</span>
                <span className="recommendation-card__unavailable">{badge}</span>
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <div className="recommendation-card__footer">
                <span>Open in SmartCampus</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="transport-insight" aria-labelledby="transport-title">
        <SectionHeading eyebrow="Phase 15" title="Live bus tracking" detail="Staff-reported demo telemetry." />
        <div className="snapshot-grid">
          <DataSummaryCard
            title="Transport"
            description={
              transport.data?.assignment
                ? `${transport.data.assignment.route.name} · pickup ${transport.data.assignment.stop.name}`
                : transport.error
                  ? `Tracking unavailable: ${transport.error}`
                  : "No bus route assigned to you"
            }
            icon={GraduationCap}
            accent="blue"
            value={transport.data?.assignment?.vehicle?.registrationNumber ?? "—"}
            {...panelState(transport.data, transport.loading, transport.error, "Demo tracking", "No route")}
          />
          <article className="insight-card" aria-labelledby="transport-title">
            <div className="insight-card__mesh" aria-hidden="true" />
            <div className="insight-card__head">
              <span className="insight-card__icon">
                <Activity size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="insight-card__eyebrow">Bus status</span>
            </div>
            <h3 id="transport-title">Tracking</h3>
            <TrackingStatusLine tracking={transport.data?.tracking ?? null} />
            <div className="insight-card__footer">
              <span className="insight-card__dot" aria-hidden="true" />
              Demo data, not live GPS
            </div>
          </article>
        </div>
      </section>

      <div className="data-boundary-note">
        <span className="data-boundary-note__icon">
          <Activity size={16} aria-hidden="true" />
        </span>
        <p>
          <strong>Live SmartCampus data.</strong> Every figure on this page comes from the authenticated
          student&apos;s own records via the SmartCampus API. Transport tracking is staff-reported demo
          telemetry, not live GPS.
        </p>
      </div>
    </div>
  );
}

type DataSummaryCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "aqua" | "blue" | "violet";
  value: string;
  status: string;
  degraded: boolean;
};
