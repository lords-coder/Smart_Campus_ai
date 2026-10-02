import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarDays, Sparkles, Wallet, BookOpen, LibraryBig, GraduationCap, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";

interface QuickActionProps {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** Explicit call to action, surfaced on the integrated Command Center. */
  cta?: string;
}

export function QuickAction({ href, icon, title, description }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export const STUDENT_QUICK_ACTIONS: QuickActionProps[] = [
  {
    href: "/attendance",
    icon: <CalendarCheck className="h-5 w-5" />,
    title: "Attendance",
    description: "Course-wise attendance record",
    cta: "Open Attendance",
  },
  {
    href: "/fees",
    icon: <Wallet className="h-5 w-5" />,
    title: "Fees",
    description: "Pending dues and payment history",
    cta: "Open Fees",
  },
  {
    href: "/timetable",
    icon: <CalendarDays className="h-5 w-5" />,
    title: "Timetable",
    description: "Weekly class schedule",
    cta: "Open Timetable",
  },
  {
    href: "/ai",
    icon: <Sparkles className="h-5 w-5" />,
    title: "AI Assistant",
    description: "Ask about classes, fees and more",
    cta: "Ask the assistant",
  },
  {
    href: "/recommendations",
    icon: <BookOpen className="h-5 w-5" />,
    title: "Recommendations",
    description: "Personalized learning plan",
    cta: "View recommendations",
  },
  {
    href: "/library",
    icon: <LibraryBig className="h-5 w-5" />,
    title: "Library",
    description: "Borrowed books, reservations and fines",
    cta: "Open Library",
  },
  {
    href: "/mess",
    icon: <UtensilsCrossed className="h-5 w-5" />,
    title: "Mess & Canteen",
    description: "Meal plans, menu and food orders",
    cta: "Open Mess",
  },
  {
    href: "/alumni",
    icon: <GraduationCap className="h-5 w-5" />,
    title: "Alumni",
    description: "Mentors, events and giving",
    cta: "Meet alumni",
  },
];
