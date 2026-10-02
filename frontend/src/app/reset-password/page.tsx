import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { BrandMark } from "@/components/layout/brand-mark";
import { LoadingState } from "@/components/states/loading-state";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <div className="auth-surface">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="auth-surface__mark">
            <BrandMark compact />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">SmartCampus AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">Reset your password</p>
        </div>
        <Suspense fallback={<LoadingState label="Checking your reset link..." />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}