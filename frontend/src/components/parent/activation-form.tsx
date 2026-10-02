"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { api, apiErrorMessage } from "@/lib/api";
import { setToken } from "@/lib/auth";

function ActivationFormInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const [token, setTokenValue] = useState(params.get("token") ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ token: string }>("/parent/activate", {
        method: "POST",
        body: { token: token.trim(), name: name.trim(), password },
        token: null,
      });
      setToken(data.token);
      await refresh();
      router.replace("/parent");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-surface">
      <div className="w-full max-w-md">
        <Card>
        <CardHeader>
          <CardTitle>Activate parent account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the invitation link shared by the institute office, then choose your password.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="act-token">Invitation token</label>
              <input
                id="act-token"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={token}
                onChange={(e) => setTokenValue(e.target.value)}
                required
                minLength={20}
                placeholder="Paste your invitation token"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="act-name">Full name</label>
              <input
                id="act-name"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="act-password">Password</label>
              <input
                id="act-password"
                type="password"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={72}
                placeholder="At least 8 characters"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Activating..." : "Activate account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already activated? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

export function ActivationForm() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ActivationFormInner />
    </Suspense>
  );
}
