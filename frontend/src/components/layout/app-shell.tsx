"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  WORKSPACE_LABEL,
  activeNavGroup,
  activeNavItem,
  navGroupsForRole,
  type NavItem,
} from "@/components/layout/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { CommandPalette } from "@/components/layout/command-palette";
import { roleHome } from "@/lib/format";

/**
 * The global application shell, from the command-center prototype.
 *
 * One shell for every authenticated role. It owns the background, the grouped
 * role-aware navigation, the sticky header, the page container, the mobile
 * drawer and the transition system; pages own their own content.
 *
 * The prototype's dead affordances - navigation buttons that only raised a
 * "isn't connected" notice, a search field with no index, a notifications bell
 * with no notification service - are not carried over. The search field became
 * the command palette over the same navigation list, and the bell was dropped
 * because the backend has no notifications to show.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const [isCompact, setIsCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  const groups = navGroupsForRole(user?.role);
  const activeItem = activeNavItem(pathname, user?.role);
  const activeGroup = activeNavGroup(pathname, user?.role);
  const profileItem: NavItem | undefined = groups
    .find((group) => group.id === "account")
    ?.items[0];
  const workspace = WORKSPACE_LABEL[user?.role ?? ""] ?? "SmartCampus";

  // Close every transient surface on navigation (state adjusted during render,
  // so the new page never renders with a stale menu or an open drawer).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
    setProfileOpen(false);
    setPaletteOpen(false);
  }

  const handleLogout = useCallback(async () => {
    await logout();
    // Hard navigation rather than router.replace: a client-side transition
    // leaves the previous authenticated view in the router cache, so the browser
    // back button can restore it after the token has been discarded.
    window.location.replace("/login");
  }, [logout]);

  // Drawer: move focus in on open, back to the trigger on close, Escape closes.
  useEffect(() => {
    if (!mobileOpen) return;
    drawerCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // Account menu: dismiss on Escape or a click outside.
  useEffect(() => {
    if (!profileOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  // Command palette: the prototype's ⌘K affordance, wired to the navigation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" && event.key !== "K") return;
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      // Never steal the shortcut from a field the user is typing in.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const sidebarClass = [
    "sidebar",
    isCompact ? "sidebar--compact" : "",
    mobileOpen ? "sidebar--mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const initials = (user?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={sidebarClass} aria-label="Primary">
        <div className="sidebar-brand-row">
          <Link
            className="sidebar-brand-link"
            href={roleHome(user?.role ?? "STUDENT")}
            aria-label={`SmartCampus AI · ${workspace}`}
          >
            <BrandMark />
          </Link>
          <button
            className="sidebar-collapse icon-button"
            type="button"
            onClick={() => setIsCompact((value) => !value)}
            aria-label={isCompact ? "Expand navigation" : "Collapse navigation"}
            title={isCompact ? "Expand navigation" : "Collapse navigation"}
          >
            {isCompact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            ref={drawerCloseRef}
            className="sidebar-mobile-close icon-button"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Sections">
          {groups.map((group) => (
            <div className="nav-group" key={group.id}>
              <p className="nav-group__label">{group.label}</p>
              <div className="nav-group__items">
                {group.items.map(({ label, href, icon: Icon }) => {
                  const isActive = activeItem?.href === href;
                  const isCurrent = pathname === href;
                  return (
                    <div className="nav-row" key={`${group.id}-${href}`}>
                      <Link
                        href={href}
                        className={`nav-link${isActive ? " nav-link--active" : ""}`}
                        aria-current={isCurrent ? "page" : isActive ? "true" : undefined}
                        aria-label={isCompact ? label : undefined}
                        title={isCompact ? label : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                        <span className="nav-label">{label}</span>
                        {isActive && <span className="nav-active-mark" aria-hidden="true" />}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-status">
          <span className="sidebar-status__icon">
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
          <div className="sidebar-status__copy">
            <strong>Signed in</strong>
            <span>{user?.email}</span>
          </div>
          <span className="status-indicator status-indicator--live" aria-hidden="true" />
        </div>
        <p className="sidebar-footer">SMARTCAMPUS · {user?.role}</p>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={mobileTriggerRef}
              type="button"
              className="mobile-menu-trigger icon-button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div className="topbar-context">
              <span className="topbar-context__eyebrow">SMARTCAMPUS AI</span>
              <span className="topbar-context__title">
                {activeGroup ? `${workspace} · ${activeGroup.label}` : workspace}
              </span>
            </div>
          </div>

          <div className="topbar-tools">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-expanded={paletteOpen}
              aria-controls="command-palette-list"
              aria-label="Search pages"
            >
              <Search size={17} aria-hidden="true" />
              <span>Search pages</span>
              <kbd>⌘ K</kbd>
            </button>

            <div className="profile-wrap" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                className="profile-button"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((value) => !value)}
              >
                <span className="profile-avatar" aria-hidden="true">
                  {initials || <UserRound size={18} />}
                </span>
                <span className="profile-copy">
                  <strong>{user?.name}</strong>
                  <small>{user?.role}</small>
                </span>
                <ChevronDown size={15} className="profile-chevron" aria-hidden="true" />
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu" aria-label="Account">
                  <p className="profile-menu__heading">{user?.name}</p>
                  <p>{user?.email}</p>
                  {profileItem && (
                    <Link
                      className="profile-menu__item"
                      role="menuitem"
                      href={profileItem.href}
                      onClick={() => setProfileOpen(false)}
                    >
                      View profile
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="profile-menu__item"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} aria-hidden="true" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-main">{children}</main>

        <footer className="app-footer">
          <span>SmartCampus AI</span>
          <span className="footer-separator" aria-hidden="true">
            ·
          </span>
          <span>AI-powered college and university management</span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} groups={groups} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
