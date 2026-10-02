"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { StatCard } from "@/components/layout/stat-card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { attendanceStatusClass, attendanceTone, formatDate, toneBadgeClass } from "@/lib/format";
import type { AttendanceHistory, AttendanceSummary } from "@/lib/types";

function AttendanceContent() {
  const { data, loading, error, reload } = useApi<AttendanceSummary>(
    "/students/me/attendance-summary",
  );
  const recent = useApi<AttendanceHistory>("/students/me/attendance?limit=10");

  return (
    <PageContainer
      title="Attendance"
      description="Course-wise attendance for the current semester"
    >
      {loading ? (
        <LoadingState label="Loading attendance..." />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Overall"
              value={`${data?.overall.percentage ?? 0}%`}
              hint="Present + late vs total classes"
            />
            <StatCard
              title="Present"
              value={data?.overall.present ?? 0}
              hint={`${data?.overall.late ?? 0} classes marked late`}
            />
            <StatCard
              title="Absent"
              value={data?.overall.absent ?? 0}
              hint={`${data?.overall.leave ?? 0} classes on approved leave`}
            />
            <StatCard
              title="Total classes"
              value={data?.overall.total ?? 0}
              hint="Recorded across all enrolled courses"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Course breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.byCourse.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No attendance has been recorded for you yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Course</TableHead>
                        <TableHead className="text-right">Present</TableHead>
                        <TableHead className="text-right">Late</TableHead>
                        <TableHead className="text-right">Absent</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Attendance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.byCourse.map((course) => (
                        <TableRow key={course.courseId}>
                          <TableCell>
                            <div className="font-medium">{course.name}</div>
                            <div className="text-xs text-muted-foreground">{course.code}</div>
                          </TableCell>
                          <TableCell className="text-right">{course.present}</TableCell>
                          <TableCell className="text-right">{course.late}</TableCell>
                          <TableCell className="text-right">{course.absent}</TableCell>
                          <TableCell className="text-right">{course.total}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={toneBadgeClass[attendanceTone(course.percentage)]}
                            >
                              {course.percentage}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.loading ? (
                <LoadingState label="Loading recent records..." />
              ) : recent.error ? (
                <ErrorState message={recent.error} onRetry={recent.reload} />
              ) : (recent.data?.records.length ?? 0) === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No sessions recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.data?.records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>
                            <div className="font-medium">{record.course.name}</div>
                            <div className="text-xs text-muted-foreground">{record.course.code}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={attendanceStatusClass[record.status]}>
                              {record.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Minimum required attendance to write exams is typically 75%.
          </p>
        </div>
      )}
    </PageContainer>
  );
}

export default function AttendancePage() {
  return (
    <RoleGuard roles={["STUDENT"]}>
      <AttendanceContent />
    </RoleGuard>
  );
}
