"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/providers/auth-provider";
import type { FacultyProfile, ParentProfile, StudentProfile } from "@/lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ProfileContent() {
  const { user, profile } = useAuth();
  const student = (user?.role === "STUDENT" ? profile : null) as StudentProfile | null;
  const faculty = (user?.role === "FACULTY" ? profile : null) as FacultyProfile | null;
  const parent = (user?.role === "PARENT" ? profile : null) as ParentProfile | null;

  return (
    <PageContainer title="Profile" description="Your account and academic details">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center gap-3">
              <Badge>{user?.role}</Badge>
              <span className="text-sm text-muted-foreground">{user?.email}</span>
            </div>
            <Separator />
            <Row label="Full name" value={user?.name ?? "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row label="Role" value={user?.role ?? "—"} />
            <Row
              label="Member since"
              value={
                user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{student ? "Student record" : parent ? "Linked students" : "Faculty record"}</CardTitle>
          </CardHeader>
          <CardContent>
            {student ? (
              <>
                <Row label="Student ID" value={student.studentNo} />
                <Row label="Department" value={student.department} />
                <Row label="Semester" value={`Semester ${student.semester}`} />
                <Row label="Section" value={`Section ${student.section}`} />
                <Row label="Batch year" value={String(student.batchYear)} />
              </>
            ) : parent ? (
              <>
                {parent.linkedStudents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No students are linked to this account yet.
                  </p>
                ) : (
                  parent.linkedStudents.map((s) => (
                    <Row
                      key={s.studentId}
                      label={`${s.name} (${s.relationshipType.toLowerCase()})`}
                      value={`${s.studentNo} · Sem ${s.semester} · Sec ${s.section}`}
                    />
                  ))
                )}
              </>
            ) : faculty ? (
              <>
                <Row label="Employee ID" value={faculty.employeeNo} />
                <Row label="Department" value={faculty.department} />
                <Row label="Designation" value={faculty.designation} />
              </>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                No additional record is linked to this account yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default function ProfilePage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY", "ADMIN", "PARENT"]}>
      <ProfileContent />
    </RoleGuard>
  );
}
