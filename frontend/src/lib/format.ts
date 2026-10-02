const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const formatCurrency = (value: number): string => currency.format(value);

export const formatDate = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatTime = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
};

export type Tone = "good" | "warn" | "bad" | "neutral";

export const attendanceTone = (percentage: number): Tone => {
  if (percentage >= 85) return "good";
  if (percentage >= 75) return "warn";
  return "bad";
};

export const toneTextClass: Record<Tone, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-muted-foreground",
};

export const toneBadgeClass: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-muted text-muted-foreground border-border",
};

export const roleHome = (role: string): string => {
  if (role === "SUPER_ADMIN") return "/super-admin";
  if (role === "FACULTY") return "/faculty";
  if (role === "ADMIN") return "/admin";
  if (role === "PARENT") return "/parent";
  if (role === "ALUMNI") return "/alumni";
  return "/dashboard";
};

/** Local-time YYYY-MM-DD string (matches the backend's date contract). */
export const toISODate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const feeStatusClass: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING: "bg-red-50 text-red-700 border-red-200",
};

export const attendanceStatusClass: Record<string, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LATE: "bg-amber-50 text-amber-700 border-amber-200",
  LEAVE: "bg-sky-50 text-sky-700 border-sky-200",
  ABSENT: "bg-red-50 text-red-700 border-red-200",
};

export const paymentMethodLabel: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CARD: "Card",
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const performanceColor = (category: string | undefined): string => {
  if (!category) return "text-muted-foreground";
  switch (category) {
    case "EXCELLENT":
      return "text-emerald-600";
    case "GOOD":
      return "text-lime-500";
    case "AVERAGE":
      return "text-amber-500";
    case "AT_RISK":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
};

/**
 * Human label for a transport tracking status.
 * The API speaks in `MOVING`/`IDLE`/`OFFLINE`; every surface that shows a
 * status to a student, parent or admin must render the same friendly wording.
 */
export const trackingStatusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case "MOVING":
      return "Moving";
    case "IDLE":
      return "Idle";
    case "OFFLINE":
      return "Offline";
    default:
      return status ?? "Unknown";
  }
};

export const trackingStatusColor = (status: string | null | undefined): string => {
  switch (status) {
    case "MOVING":
      return "bg-emerald-100 text-emerald-800";
    case "IDLE":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-muted text-muted-foreground";
  }
};