import { PasswordHelpForm } from "@/components/auth/password-help-form";
import { BrandMark } from "@/components/layout/brand-mark";

export const metadata = { title: "Account help" };

export default function ForgotPasswordPage() {
  return (
    <div className="auth-surface">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="auth-surface__mark">
            <BrandMark compact />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">SmartCampus AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">Forgot your password? Request help</p>
        </div>
        <PasswordHelpForm />
      </div>
    </div>
  );
}