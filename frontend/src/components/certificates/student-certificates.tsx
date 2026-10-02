"use client";

import { useState } from "react";
import { Award } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import type { Certificate, CertificateRequest, CertificateType } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-300",
  APPROVED: "bg-blue-100 text-blue-800 border-blue-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  ISSUED: "bg-green-100 text-green-800 border-green-300",
  REVOKED: "bg-gray-100 text-gray-600 border-gray-300",
};

const TYPE_OPTIONS: Array<{ value: CertificateType; label: string; hint: string }> = [
  { value: "BONAFIDE", label: "Bonafide Certificate", hint: "Proof of studentship for banks, passports, and applications." },
  { value: "TRANSCRIPT", label: "Academic Transcript (Demo)", hint: "Summary of internal academic indicators." },
  { value: "CONDUCT", label: "Conduct Certificate", hint: "Statement of conduct during the period of study." },
  { value: "ENROLLMENT", label: "Enrollment Certificate", hint: "Proof of current program enrollment." },
];

async function fetchCertificatePdf(id: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/certificates/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

async function downloadWithAuth(id: string, filename: string) {
  const blob = await fetchCertificatePdf(id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function viewWithAuth(id: string, setBusy: (id: string | null) => void) {
  setBusy(id);
  try {
    const blob = await fetchCertificatePdf(id);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
  } finally {
    setBusy(null);
  }
}

export function StudentCertificates() {
  const requests = useApi<{ requests: CertificateRequest[] }>("/certificates/requests");
  const issued = useApi<{ certificates: Certificate[] }>("/certificates");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reload = () => {
    requests.reload();
    issued.reload();
  };

  if (requests.error || issued.error) {
    return <ErrorState message={requests.error ?? issued.error ?? "Failed to load"} onRetry={reload} />;
  }
  if (requests.loading || issued.loading) {
    return <LoadingState label="Loading certificates..." />;
  }

  async function handleDownload(cert: Certificate) {
    setDownloading(cert.id);
    try {
      await downloadWithAuth(cert.id, `${cert.certificateNumber}.pdf`);
    } catch {
      /* the list stays usable; retry is one click away */
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>Request certificate</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My requests ({requests.data?.requests.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(requests.data?.requests.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No certificate requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {(requests.data?.requests ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{r.certificateType}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {r.createdAt.slice(0, 10)}
                      {r.purpose ? ` · ${r.purpose}` : ""}
                    </p>
                    {r.status === "REJECTED" && r.rejectionReason && (
                      <p className="mt-1 text-xs text-red-700">Reason: {r.rejectionReason}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={STATUS_STYLES[r.status] ?? ""}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Issued certificates ({issued.data?.certificates.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(issued.data?.certificates.length ?? 0) === 0 ? (
            <EmptyState
              title="No issued certificates"
              description="Approved requests appear here with download and verification options."
              icon={<Award className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {(issued.data?.certificates ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{c.certificateType} · {c.certificateNumber}</p>
                    <p className="text-xs text-muted-foreground">Issued {c.issuedAt.slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={STATUS_STYLES[c.status] ?? ""}>{c.status}</Badge>
                    <button
                      className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                      disabled={downloading === c.id}
                      onClick={() => viewWithAuth(c.id, setDownloading)}
                    >
                      View
                    </button>
                    <button
                      className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                      disabled={downloading === c.id}
                      onClick={() => handleDownload(c)}
                    >
                      {downloading === c.id ? "Saving..." : "Download"}
                    </button>
                    <a href={`/verify/${c.verificationCode}`} className="text-sm font-medium text-primary hover:underline">
                      Verify
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <RequestDialog
          onClose={() => setDialogOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function RequestDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [certificateType, setCertificateType] = useState<CertificateType>("BONAFIDE");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/certificates/requests", { method: "POST", body: { certificateType, purpose } });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const selected = TYPE_OPTIONS.find((t) => t.value === certificateType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Request certificate</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="cert-type">Certificate type</label>
              <select
                id="cert-type"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={certificateType}
                onChange={(e) => setCertificateType(e.target.value as CertificateType)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {selected && <p className="mt-1 text-xs text-muted-foreground">{selected.hint}</p>}
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="cert-purpose">Purpose</label>
              <textarea
                id="cert-purpose"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                minLength={5}
                maxLength={2000}
                placeholder="Why do you need this certificate?"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit request"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
