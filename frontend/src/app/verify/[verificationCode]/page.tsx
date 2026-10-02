"use client";

import { use } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, SearchX } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import type { PublicVerification } from "@/lib/types";

function VerifyContent({ code }: { code: string }) {
  const { data, loading, error } = useApi<PublicVerification>(
    `/certificates/verify/${encodeURIComponent(code)}`,
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="font-semibold tracking-wide">SmartCampus · Certificate Verification</p>
          <Link href="/login" className="text-sm text-slate-400 hover:text-slate-200 hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          {loading && <p className="text-center text-slate-400">Checking certificate…</p>}
          {!loading && (error || !data) && (
            <div className="text-center">
              <SearchX className="mx-auto h-12 w-12 text-slate-500" />
              <h1 className="mt-4 text-2xl font-bold">Certificate Not Found</h1>
              <p className="mt-2 text-sm text-slate-400">
                No certificate matches this verification code. Check the code on the
                document and try again.
              </p>
            </div>
          )}
          {!loading && data && data.status === "VALID" && (
            <div className="text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-emerald-400" />
              <h1 className="mt-4 text-2xl font-bold text-emerald-300">Certificate Verified</h1>
              <dl className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
                  <dt className="text-slate-400">Certificate</dt>
                  <dd className="font-medium">{data.certificateNumber}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
                  <dt className="text-slate-400">Type</dt>
                  <dd className="font-medium">{data.certificateType}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
                  <dt className="text-slate-400">Issued to</dt>
                  <dd className="font-medium">{data.studentName}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
                  <dt className="text-slate-400">Institution</dt>
                  <dd className="font-medium">{data.institution}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Issued on</dt>
                  <dd className="font-medium">{data.issuedDate}</dd>
                </div>
              </dl>
            </div>
          )}
          {!loading && data && data.status === "REVOKED" && (
            <div className="text-center">
              <ShieldAlert className="mx-auto h-12 w-12 text-amber-400" />
              <h1 className="mt-4 text-2xl font-bold text-amber-400">Certificate Revoked</h1>
              <p className="mt-2 text-sm text-slate-400">
                {data.certificateNumber} ({data.certificateType}) was issued to{" "}
                {data.studentName} on {data.issuedDate} but has since been revoked by
                the institution. It should not be accepted as valid.
              </p>
            </div>
          )}
        </div>
      </main>
      <footer className="px-6 py-4 text-center text-xs text-slate-500">
        SmartCampus demonstration system — verification only, no personal data beyond what is shown.
      </footer>
    </div>
  );
}

export default function VerifyPage({ params }: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = use(params);
  return <VerifyContent code={verificationCode} />;
}
