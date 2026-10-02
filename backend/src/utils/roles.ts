export const ROLES = ["STUDENT", "FACULTY", "ADMIN", "PARENT", "ALUMNI", "SUPER_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

/** Roles that are operationally supported in Phase 2. */
export const ACTIVE_ROLES = ["STUDENT", "FACULTY", "ADMIN"] as const;

export type ActiveRole = (typeof ACTIVE_ROLES)[number];

export function isActiveRole(value: string): value is ActiveRole {
  return (ACTIVE_ROLES as readonly string[]).includes(value);
}
