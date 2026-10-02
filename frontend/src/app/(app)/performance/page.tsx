"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeInfo,
  BrainCircuit,
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type {
  PerformanceCategory,
  PerformancePrediction,
  StudentPerformanceFeatures,
} from "@/lib/types";

const CATEGORY_LABELS: Record<PerformanceCategory, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  AVERAGE: "Average",
  AT_RISK: "Needs attention",
};

const CATEGORY_TONES: Record<PerformanceCategory, string> = {
  EXCELLENT: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  GOOD: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  AVERAGE: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  AT_RISK: "border-rose-400/25 bg-rose-400/10 text-rose-300",
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`;
}

function readableLabel(value: string): string {
  const known = CATEGORY_LABELS[value as PerformanceCategory];
  return known ?? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackExplanation(reason?: string): string {
  switch (reason) {
    case "ML_DISABLED":
      return "The trained-model service is disabled in this environment, so SmartCampus used its documented threshold band.";
    case "ML_TIMEOUT":
      return "The trained-model service did not respond in time, so SmartCampus used its documented threshold band.";
    case "ML_UNREACHABLE":
      return "The trained-model service could not be reached, so SmartCampus used its documented threshold band.";
    case "ML_BAD_STATUS":
    case "ML_INVALID_RESPONSE":
    case "ML_UNEXPECTED_ERROR":
      return "The trained-model service could not provide a valid result, so SmartCampus used its documented threshold band.";
    default:
      return "The trained model was unavailable for this request, so SmartCampus used its documented threshold band.";
  }
}

function FeatureMetric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
}) {
  return (
    <Card className="h-full border-border/70 bg-card/80">
      <CardContent className="flex h-full flex-col gap-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="grid size-9 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PerformanceContent() {
  const features = useApi<StudentPerformanceFeatures>("/performance");
  const prediction = useApi<PerformancePrediction>("/performance/predict");
  const isRefreshing = features.loading || prediction.loading;
  const modelResult = Boolean(
    prediction.data?.prediction_source === "ML" && prediction.data.is_model_prediction,
  );
  const probabilityEntries = prediction.data
    ? Object.entries(prediction.data.probabilities).sort((a, b) => b[1] - a[1])
    : [];

  const refresh = () => {
    features.reload();
    prediction.reload();
  };

  return (
    <PageContainer
      title="Performance"
      description="A transparent view of your current academic signals and the way SmartCampus summarizes them."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh data
          </button>
          <Link
            href="/recommendations"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Learning plan <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]" aria-label="Academic overview">
          <Card className="relative min-h-[280px] overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
            <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border border-primary/10" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-2 -top-6 size-36 rounded-full border border-primary/10" aria-hidden="true" />
            <CardHeader className="relative">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                <Gauge className="size-4" aria-hidden="true" /> Current academic score
              </div>
              <CardDescription className="max-w-xl leading-6">
                A snapshot of the academic indicators currently returned for your account. It is not a term-over-term trend.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative flex flex-col justify-end gap-5 pb-6">
              {features.loading ? (
                <LoadingState label="Loading your academic summary…" />
              ) : features.error ? (
                <ErrorState title="Academic summary unavailable" message={features.error} onRetry={features.reload} />
              ) : features.data ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-semibold tracking-tight tabular-nums text-foreground">
                        {formatPercent(features.data.academic_score)}
                      </span>
                      <span className="pb-1 text-sm text-muted-foreground">reported score</span>
                    </div>
                    <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
                      <Activity aria-hidden="true" /> Live from SmartCampus
                    </Badge>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Academic score"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.max(0, Math.min(100, features.data.academic_score))}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, features.data.academic_score))}%` }}
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    This score is supplied by the SmartCampus performance endpoint; the page does not estimate or fill in missing values.
                  </p>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No academic summary is available for this account yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[280px] border-border/70 bg-card/90">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  <BrainCircuit className="size-4 text-primary" aria-hidden="true" /> Academic outlook
                </div>
                <CardTitle className="text-lg">Performance band</CardTitle>
              </div>
              <Sparkles className="mt-1 size-5 text-primary" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent aria-live="polite">
              {prediction.loading ? (
                <LoadingState label="Evaluating your academic outlook…" />
              ) : prediction.error ? (
                <ErrorState title="Outlook unavailable" message={prediction.error} onRetry={prediction.reload} />
              ) : prediction.data ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={`rounded-xl border px-4 py-2 text-2xl font-semibold tracking-tight ${CATEGORY_TONES[prediction.data.category]}`}>
                      {CATEGORY_LABELS[prediction.data.category]}
                    </p>
                    <Badge
                      variant="outline"
                      className={modelResult
                        ? "border-sky-400/25 bg-sky-400/10 text-sky-300"
                        : "border-amber-400/25 bg-amber-400/10 text-amber-300"}
                    >
                      {modelResult ? `Trained model · ${prediction.data.model_version}` : "Rule-based estimate"}
                    </Badge>
                  </div>

                  {modelResult ? (
                    <>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Model confidence</span>
                        <span className="font-semibold tabular-nums">{formatPercent(prediction.data.confidence * 100)}</span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label="Model confidence"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(Math.max(0, Math.min(1, prediction.data.confidence)) * 100)}
                      >
                        <div
                          className="h-full rounded-full bg-sky-400"
                          style={{ width: `${Math.max(0, Math.min(1, prediction.data.confidence)) * 100}%` }}
                        />
                      </div>
                      <div className="space-y-3 border-t border-border/70 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Model class probabilities
                        </p>
                        {probabilityEntries.map(([category, rawValue]) => {
                          const value = Number.isFinite(rawValue) ? Math.max(0, Math.min(1, rawValue)) : 0;
                          return (
                            <div key={category} className="space-y-1.5">
                              <div className="flex justify-between gap-3 text-xs">
                                <span>{readableLabel(category)}</span>
                                <span className="tabular-nums text-muted-foreground">{formatPercent(value * 100)}</span>
                              </div>
                              <div
                                className="h-1.5 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-label={`${readableLabel(category)} model probability`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(value * 100)}
                              >
                                <div className="h-full rounded-full bg-primary/80" style={{ width: `${value * 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                      <p className="text-sm leading-6 text-amber-100/90">
                        {fallbackExplanation(prediction.data.fallback_reason)}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        This threshold band is not a trained-model prediction. No model confidence or class probabilities are shown for this result.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  A performance band is not available for this account yet.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="signals-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Your record</p>
              <h2 id="signals-title" className="mt-1 text-xl font-semibold tracking-tight">Academic signals</h2>
              <p className="mt-1 text-sm text-muted-foreground">Values below mirror the student-scoped performance API response.</p>
            </div>
            <Link href="/attendance" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              View attendance <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {features.loading ? (
            <LoadingState label="Loading academic signals…" />
          ) : features.error ? (
            <ErrorState title="Academic signals unavailable" message={features.error} onRetry={features.reload} />
          ) : features.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <FeatureMetric label="Attendance" value={formatPercent(features.data.attendance_percentage)} hint="Attendance percentage from the performance summary." icon={ClipboardCheck} />
              <FeatureMetric label="Assessment average" value={formatPercent(features.data.avg_assessment_percentage)} hint={features.data.total_assessments === 0 ? "No assessment records are currently available." : `Average across ${features.data.total_assessments} recorded assessments.`} icon={ChartNoAxesCombined} />
              <FeatureMetric label="Assignment submissions" value={formatPercent(features.data.assignment_submission_rate)} hint="Submission rate returned by SmartCampus." icon={BookOpenCheck} />
              <FeatureMetric label="Assignment score" value={formatPercent(features.data.avg_assignment_score)} hint="Average assignment score, shown as a percentage." icon={Gauge} />
              <FeatureMetric label="Assessments recorded" value={String(features.data.total_assessments)} hint="Assessment records included in the summary." icon={Activity} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No academic signal summary is available yet.
            </p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="How to use this information">
          <Card className="border-primary/15 bg-primary/[0.04]">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <BadgeInfo className="size-4" aria-hidden="true" />
                <CardTitle>How to read this page</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Academic signals are a current summary, not a history or a trend. Their meaning depends on the records currently held by your institution.
              </p>
              <p>
                The performance model was trained on synthetic academic data and is not validated for real-world academic decisions. Treat its output as guidance—not an official grade, diagnosis, or guarantee.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-400/15 bg-amber-400/[0.035]">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-300">
                <ShieldAlert className="size-4" aria-hidden="true" />
                <CardTitle>Need a practical next step?</CardTitle>
              </div>
              <CardDescription>Open the student support tools that use your current record.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link href="/recommendations" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <BookOpenCheck className="size-4 text-primary" aria-hidden="true" /> Recommendations <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/ai" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Sparkles className="size-4 text-primary" aria-hidden="true" /> Ask AI Assistant <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}

export default function PerformancePage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <PerformanceContent />
    </RoleGuard>
  );
}
