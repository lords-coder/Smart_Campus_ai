"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InlineSpinner } from "@/components/states/loading-state";
import { api, apiErrorMessage } from "@/lib/api";
import type { Role } from "@/lib/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "STUDENT", label: "Student" },
  { value: "FACULTY", label: "Faculty" },
  { value: "ADMIN", label: "Administrator" },
  { value: "PARENT", label: "Parent" },
  { value: "ALUMNI", label: "Alumni" },
];

export function PasswordHelpForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; message?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const errors: { email?: string; message?: string } = {};
    if (!email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address";
    if (message.trim().length < 5) errors.message = "Tell us briefly what you need help with";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await api<{ message: string }>("/auth/password-help", {
        method: "POST",
        token: null,
        body: {
          email: email.trim().toLowerCase(),
          message: message.trim(),
          contact: contact.trim() || undefined,
          role: role || undefined,
        },
      });
      setSuccess(result.message);
      setEmail("");
      setMessage("");
      setContact("");
      setRole("");
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account help</CardTitle>
        <CardDescription>
          Password recovery is handled by the campus administration. Send a request and an administrator will
          help you regain access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="help-email">University email</Label>
            <Input
              id="help-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="help-role">Account type</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="help-role">
                <SelectValue placeholder="Select your account type" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="help-message">What do you need help with?</Label>
            <Textarea
              id="help-message"
              rows={4}
              placeholder="I cannot sign in, my password is locked..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={Boolean(fieldErrors.message)}
            />
            {fieldErrors.message && <p className="text-xs text-red-600">{fieldErrors.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="help-contact">Contact details (optional)</Label>
            <Input
              id="help-contact"
              placeholder="Phone number or alternate email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <InlineSpinner className="mr-2" />
                Sending request...
              </>
            ) : (
              "Send help request"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Remembered your password?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}