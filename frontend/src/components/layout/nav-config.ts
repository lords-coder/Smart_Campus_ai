import {
  Award,
  BedDouble,
  BookOpen,
  Briefcase,
  Bus,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  FileBadge,
  GraduationCap,
  HeartHandshake,
  Home,
  LayoutDashboard,
  LibraryBig,
  Sparkles,
  User,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";
import { Shield } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * The shell's navigation model.
 *
 * One list, grouped by what a student actually does, with every entry carrying
 * the roles its page's `RoleGuard` accepts - so the sidebar can never offer a
 * link that bounces straight back to the role's home. A route that exists for
 * a role is listed; a route that does not exist is not.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["STUDENT"] },
      { label: "Dashboard", href: "/faculty", icon: LayoutDashboard, roles: ["FACULTY"] },
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Dashboard", href: "/parent", icon: Home, roles: ["PARENT"] },
      { label: "Dashboard", href: "/alumni", icon: LayoutDashboard, roles: ["ALUMNI"] },
      { label: "Dashboard", href: "/super-admin", icon: Shield, roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    items: [
      { label: "Attendance", href: "/attendance", icon: CalendarCheck, roles: ["STUDENT"] },
      { label: "Performance", href: "/performance", icon: ChartNoAxesCombined, roles: ["STUDENT"] },
      { label: "Timetable", href: "/timetable", icon: CalendarDays, roles: ["STUDENT"] },
      { label: "Timetable", href: "/faculty/timetable", icon: CalendarDays, roles: ["FACULTY"] },
      { label: "Timetable", href: "/admin/timetable", icon: CalendarDays, roles: ["ADMIN", "SUPER_ADMIN"] },
    ],
  },
  {
    id: "insights",
    label: "AI & Insights",
    items: [
      {
        label: "AI Assistant",
        href: "/ai",
        icon: Sparkles,
        roles: ["STUDENT", "FACULTY", "ADMIN", "PARENT", "SUPER_ADMIN"],
      },
      { label: "Recommendations", href: "/recommendations", icon: BookOpen, roles: ["STUDENT"] },
      { label: "Risk Indicators", href: "/faculty/risk", icon: HeartHandshake, roles: ["FACULTY"] },
      { label: "Risk Overview", href: "/admin/risk", icon: HeartHandshake, roles: ["ADMIN", "SUPER_ADMIN"] },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [{ label: "Fees", href: "/fees", icon: Wallet, roles: ["STUDENT"] }],
  },
  {
    id: "campus",
    label: "Campus",
    items: [
      { label: "Hostel", href: "/hostel", icon: BedDouble, roles: ["STUDENT"] },
      { label: "Transport", href: "/transport", icon: Bus, roles: ["STUDENT"] },
      { label: "Library", href: "/library", icon: LibraryBig, roles: ["STUDENT", "FACULTY"] },
      { label: "Certificates", href: "/certificates", icon: Award, roles: ["STUDENT"] },
      { label: "Mess & Canteen", href: "/mess", icon: UtensilsCrossed, roles: ["STUDENT"] },
      { label: "Hostel", href: "/admin/hostel", icon: BedDouble, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Transport", href: "/admin/transport", icon: Bus, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Library", href: "/admin/library", icon: LibraryBig, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Certificates", href: "/admin/certificates", icon: FileBadge, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Mess & Canteen", href: "/admin/mess", icon: UtensilsCrossed, roles: ["ADMIN", "SUPER_ADMIN"] },
    ],
  },
  {
    id: "career",
    label: "Career",
    items: [
      { label: "Placements", href: "/placements", icon: Briefcase, roles: ["STUDENT", "FACULTY"] },
      { label: "Placements", href: "/admin/placements", icon: Briefcase, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Alumni", href: "/alumni", icon: GraduationCap, roles: ["STUDENT", "FACULTY"] },
      { label: "Alumni", href: "/admin/alumni", icon: GraduationCap, roles: ["ADMIN", "SUPER_ADMIN"] },
      { label: "Events", href: "/alumni/events", icon: CalendarDays, roles: ["STUDENT", "FACULTY", "ALUMNI"] },
      { label: "Campaigns", href: "/alumni/campaigns", icon: HeartHandshake, roles: ["STUDENT", "ALUMNI"] },
      { label: "Mentorship", href: "/alumni/mentorship", icon: Users, roles: ["STUDENT", "ALUMNI"] },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [{ label: "Parents", href: "/admin/parents", icon: Users, roles: ["ADMIN", "SUPER_ADMIN"] }],
  },
  {
    id: "super-admin",
    label: "Super Admin",
    items: [
      { label: "Registrations", href: "/super-admin", icon: Shield, roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    id: "account",
    label: "Profile",
    items: [
      { label: "Profile", href: "/profile", icon: User, roles: ["STUDENT", "FACULTY", "ADMIN", "PARENT", "SUPER_ADMIN"] },
      { label: "My Profile", href: "/alumni/profile", icon: User, roles: ["ALUMNI"] },
    ],
  },
];

/** The workspace each role lands in, shown in the topbar. */
export const WORKSPACE_LABEL: Record<string, string> = {
  STUDENT: "Student workspace",
  FACULTY: "Faculty workspace",
  ADMIN: "Admin workspace",
  PARENT: "Parent portal",
  ALUMNI: "Alumni workspace",
  SUPER_ADMIN: "Admin workspace",
};

export function navGroupsForRole(role: Role | undefined): NavGroup[] {
  if (!role) return [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function navItemsForRole(role: Role | undefined): NavItem[] {
  return navGroupsForRole(role).flatMap((group) => group.items);
}

function covers(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The navigation entry for a route, chosen by longest match rather than by
 * `startsWith` on every entry.
 *
 * `/admin` is a prefix of `/admin/transport`, `/faculty` of `/faculty/risk`, and
 * `/alumni` of `/alumni/events`; matching every entry would light up two links
 * at once. The deepest entry that covers the path is the one that is current.
 */
export function activeNavItem(pathname: string, role: Role | undefined): NavItem | null {
  const matches = navItemsForRole(role)
    .filter((item) => covers(item, pathname))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0] ?? null;
}

export function activeNavGroup(
  pathname: string,
  role: Role | undefined,
): NavGroup | null {
  const active = activeNavItem(pathname, role);
  if (!active) return null;
  return navGroupsForRole(role).find((group) => group.items.includes(active)) ?? null;
}
