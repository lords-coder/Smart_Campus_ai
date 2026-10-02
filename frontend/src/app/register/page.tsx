import { RegisterWizard } from "@/components/auth/register-wizard";
import { BrandMark } from "@/components/layout/brand-mark";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="auth-surface">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="auth-surface__mark">
            <BrandMark compact />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">SmartCampus AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">Request access to the campus platform</p>
        </div>
        <RegisterWizard />
      </div>
    </div>
  );
}