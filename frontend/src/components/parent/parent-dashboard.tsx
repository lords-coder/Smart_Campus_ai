"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, Bell, BedDouble, BookOpen, Briefcase, Bus, CalendarCheck, CalendarDays, LibraryBig, UtensilsCrossed, Wallet } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/components/providers/auth-provider";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { StudentSwitcher } from "./student-switcher";
import { attendanceTone, formatCurrency, formatTime, toneTextClass, trackingStatusLabel } from "@/lib/format";
import type {
  AttendanceSummary,
  Certificate,
  FeesSummary,
  MyTransport,
  ParentHostel,
  ParentLibrary,
  ParentMess,
  ParentNotices,
  ParentOverview,
  ParentPlacements,
  ParentRecommendations,
  ParentProfile,
  TimetableDay,
} from "@/lib/types";

const NOTICE_STYLES: Record<string, string> = {
  ATTENDANCE_WARNING: "border-amber-200 bg-amber-50",
  FEE_DUE: "border-red-200 bg-red-50",
  TODAY_CLASSES: "border-sky-200 bg-sky-50",
};

export function ParentDashboard() {
  const { profile } = useAuth();
  const parent = profile as ParentProfile | null;
  const linked = useMemo(() => parent?.linkedStudents ?? [], [parent]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? linked[0]?.studentId ?? null;

  const overview = useApi<ParentOverview>(activeId ? `/parent/students/${activeId}/overview` : null);
  const attendance = useApi<AttendanceSummary>(activeId ? `/parent/students/${activeId}/attendance` : null);
  const fees = useApi<FeesSummary>(activeId ? `/parent/students/${activeId}/fees` : null);
  const timetable = useApi<TimetableDay>(activeId ? `/parent/students/${activeId}/timetable` : null);
  const recommendations = useApi<ParentRecommendations>(activeId ? `/parent/students/${activeId}/recommendations` : null);
  const notices = useApi<ParentNotices>(activeId ? `/parent/students/${activeId}/notices` : null);
  const transport = useApi<MyTransport>(activeId ? `/parent/students/${activeId}/transport` : null);
  const hostel = useApi<ParentHostel>(activeId ? `/parent/students/${activeId}/hostel` : null);
  const mess = useApi<ParentMess>(activeId ? `/parent/students/${activeId}/mess` : null);
  const library = useApi<ParentLibrary>(activeId ? `/parent/students/${activeId}/library` : null);
  const placements = useApi<ParentPlacements>(activeId ? `/parent/students/${activeId}/placements` : null);
  const certificates = useApi<{ certificates: Certificate[] }>(activeId ? `/parent/students/${activeId}/certificates` : null);

  if (!parent || linked.length === 0) {
    return (
      <EmptyState
        title="No students linked yet"
        description="Your parent account is active, but no student has been linked to it. Please contact the institute administration for an invitation."
        icon={<BookOpen className="h-6 w-6" />}
      />
    );
  }

  const loading = overview.loading || attendance.loading || fees.loading || timetable.loading;
  const error = overview.error ?? attendance.error ?? fees.error ?? timetable.error;
  const retry = () => {
    overview.reload();
    attendance.reload();
    fees.reload();
    timetable.reload();
    recommendations.reload();
    notices.reload();
  };

  const active = linked.find((s) => s.studentId === activeId) ?? linked[0];
  const overall = attendance.data?.overall;
  const attendancePct = overall?.percentage ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StudentSwitcher students={linked} selectedId={activeId} onSelect={setSelectedId} />
        {active && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{active.studentNo}</Badge>
            <Badge variant="secondary">Sem {active.semester} · Section {active.section}</Badge>
            <Badge variant="outline">{active.relationshipType.toLowerCase()}</Badge>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <LoadingState label="Loading student information..." />
      ) : (
        <>
          {notices.data && notices.data.notices.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {notices.data.notices.map((notice) => (
                <div key={notice.kind} className={`flex items-start gap-2 rounded-lg border p-3 ${NOTICE_STYLES[notice.kind] ?? ""}`}>
                  <Bell className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{notice.title}</p>
                    <p className="text-xs text-muted-foreground">{notice.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Overall attendance"
              value={`${attendancePct}%`}
              hint={`${overall?.present ?? 0} present of ${overall?.total ?? 0} classes`}
              icon={<CalendarCheck className="h-4 w-4" />}
              footer={<span className={toneTextClass[attendanceTone(attendancePct)]}>{active?.name}’s attendance</span>}
            />
            <StatCard
              title="Performance"
              value={overview.data?.academic.performanceCategory ?? "—"}
              hint={`Assessments avg ${overview.data?.academic.avgAssessmentPercentage ?? 0}%`}
              icon={<BookOpen className="h-4 w-4" />}
            />
            <StatCard
              title="Pending fees"
              value={formatCurrency(fees.data?.totalPending ?? 0)}
              hint={`Paid ${formatCurrency(fees.data?.totalPaid ?? 0)} of ${formatCurrency(fees.data?.totalFees ?? 0)}`}
              icon={<Wallet className="h-4 w-4" />}
            />
            <StatCard
              title="Classes today"
              value={timetable.data?.entries.length ?? 0}
              hint={timetable.data?.entries.length ? `${timetable.data.entries[0].startTime.slice(0, 5)} first class` : "No classes scheduled today"}
              icon={<CalendarDays className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Course-wise attendance</CardTitle>
              </CardHeader>
              <CardContent>
                {(attendance.data?.byCourse.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No attendance has been recorded yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {attendance.data?.byCourse.map((course) => (
                      <li key={course.courseId} className="flex items-center justify-between text-sm">
                        <span className="truncate pr-2 text-muted-foreground">{course.code} · {course.name}</span>
                        <span className={`font-medium ${toneTextClass[attendanceTone(course.percentage)]}`}>{course.percentage}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fee status</CardTitle>
              </CardHeader>
              <CardContent>
                {(fees.data?.records.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No fee records exist for this student.</p>
                ) : (
                  <ul className="space-y-2">
                    {fees.data?.records.map((record) => (
                      <li key={record.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{record.feeType}</p>
                          <p className="text-xs text-muted-foreground">Due {record.dueDate} · {formatCurrency(record.amountPaid)} paid</p>
                        </div>
                        <Badge variant="outline">{record.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Fee payments are handled by the institute office.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Today’s classes</CardTitle>
              </CardHeader>
              <CardContent>
                {(timetable.data?.entries.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No classes scheduled today.</p>
                ) : (
                  <ul className="divide-y">
                    {timetable.data?.entries.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="w-28 shrink-0 text-sm font-medium text-muted-foreground">
                          {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.course.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.course.code} · {entry.room}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Learning focus areas</CardTitle>
              </CardHeader>
              <CardContent>
                {recommendations.loading ? (
                  <p className="text-sm text-muted-foreground">Loading recommendations...</p>
                ) : (recommendations.data?.headlines.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No specific focus areas right now — academic indicators look stable.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {recommendations.data?.summary.coursesNeedingAttention} area(s) need attention
                      ({recommendations.data?.summary.highPriority} high priority).
                    </p>
                    <ul className="space-y-2">
                      {recommendations.data?.headlines.slice(0, 4).map((headline) => (
                        <li key={`${headline.courseName}-${headline.category}`} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{headline.courseName}</p>
                            <Badge variant="outline">{headline.priority}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{headline.reason}</p>
                          {headline.resourceCount > 0 && (
                            <p className="mt-1 text-xs text-primary">{headline.resourceCount} recommended learning resource(s) available</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <Link href="/ai" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                      Ask the AI assistant about this student’s records
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Bus className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Transport</CardTitle>
              </CardHeader>
              <CardContent>
                {transport.loading ? (
                  <p className="text-sm text-muted-foreground">Loading transport...</p>
                ) : !transport.data?.assignment ? (
                  <p className="text-sm text-muted-foreground">No bus route assigned to this student.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Route:</span> {transport.data.assignment.route.routeCode} · {transport.data.assignment.route.name}</p>
                    <p><span className="text-muted-foreground">Pickup:</span> {transport.data.assignment.stop.name} at {formatTime(transport.data.assignment.stop.scheduledTime)}</p>
                    <p>
                      <span className="text-muted-foreground">Vehicle:</span>{" "}
                      {transport.data.assignment.vehicle ? transport.data.assignment.vehicle.registrationNumber : "Not assigned yet"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Pass:</span>{" "}
                      {transport.data.pass ? `${transport.data.pass.passNumber} (${transport.data.pass.status})` : "Not issued yet"}
                    </p>
                    {transport.data.tracking && (
                      <p>
                        <span className="text-muted-foreground">Bus status (demo):</span>{" "}
                        {trackingStatusLabel(transport.data.tracking.trackingStatus)}
                        {transport.data.tracking.currentStop
                          ? ` · at ${transport.data.tracking.currentStop.name}`
                          : ""}
                        {transport.data.tracking.nextStop
                          ? ` · next ${transport.data.tracking.nextStop.name}`
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Placements</CardTitle>
              </CardHeader>
              <CardContent>
                {placements.loading ? (
                  <p className="text-sm text-muted-foreground">Loading placements...</p>
                ) : (placements.data?.applications.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No placement applications for this student.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {placements.data?.placed && (
                      <p className="font-medium text-emerald-700">Placed</p>
                    )}
                    {(placements.data?.applications ?? []).slice(0, 3).map((a, i) => (
                      <p key={i}>
                        {a.jobRole} · {a.companyName} · {a.status}
                        {a.offers.length > 0 && (
                          <span> · offer {a.offers[0].offerStatus}</span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Mess &amp; canteen</CardTitle>
              </CardHeader>
              <CardContent>
                {mess.loading ? (
                  <p className="text-sm text-muted-foreground">Loading mess...</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Plan:</span>{" "}
                      {mess.data?.enrollment ? `${mess.data.enrollment.planName} (${mess.data.enrollment.status})` : "Not enrolled"}
                    </p>
                    <p><span className="text-muted-foreground">Food outstanding:</span> {formatCurrency(mess.data?.billing.outstanding ?? 0)}</p>
                    <p><span className="text-muted-foreground">Meals last 7 days:</span> {mess.data?.mealsLast7Days.consumed ?? 0} consumed</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Issued certificates</CardTitle>
              </CardHeader>
              <CardContent>
                {certificates.loading ? (
                  <p className="text-sm text-muted-foreground">Loading certificates...</p>
                ) : (certificates.data?.certificates.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No certificates have been issued for this student yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {(certificates.data?.certificates ?? []).slice(0, 3).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{c.certificateType} · {c.certificateNumber}</p>
                          <p className="text-xs text-muted-foreground">Issued {c.issuedAt.slice(0, 10)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{c.status}</Badge>
                          <a href={`/verify/${c.verificationCode}`} className="text-xs font-medium text-primary hover:underline">
                            Verify
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <BedDouble className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Hostel</CardTitle>
              </CardHeader>
              <CardContent>
                {hostel.loading ? (
                  <p className="text-sm text-muted-foreground">Loading hostel...</p>
                ) : !hostel.data?.allocation ? (
                  <p className="text-sm text-muted-foreground">This student is not staying in a hostel.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Hostel:</span> {hostel.data.allocation.hostel.name} ({hostel.data.allocation.hostel.block})</p>
                    <p><span className="text-muted-foreground">Room:</span> {hostel.data.allocation.roomNumber} · Bed {hostel.data.allocation.bedNumber}</p>
                    <p><span className="text-muted-foreground">Roommates:</span> {hostel.data.roommateCount} other occupant(s)</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <LibraryBig className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Library</CardTitle>
              </CardHeader>
              <CardContent>
                {library.loading ? (
                  <p className="text-sm text-muted-foreground">Loading library...</p>
                ) : (library.data?.activeLoans.length ?? 0) === 0 && (library.data?.fineTotal ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No borrowed books and no library fines.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Borrowed:</span> {library.data?.activeLoans.length ?? 0} book(s)</p>
                    {(library.data?.activeLoans ?? []).slice(0, 3).map((loan) => (
                      <p key={loan.bookTitle}>
                        {loan.bookTitle} · due {loan.dueAt}
                        {loan.overdue && <span className="text-red-700"> · overdue {loan.overdueDays}d</span>}
                      </p>
                    ))}
                    <p><span className="text-muted-foreground">Library fines:</span> {formatCurrency(library.data?.fineTotal ?? 0)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
