import type { Role } from "../engine/approval";

export type NavKey =
  | "dashboard" | "investigate" | "journals" | "applications" | "evidence" | "approvals" | "letters" | "analytics" | "sources" | "settings";

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: ["STUDENT", "REVIEWER", "HEAD", "ADMIN"],
  investigate: ["REVIEWER", "HEAD", "ADMIN"],
  journals: ["REVIEWER", "HEAD", "ADMIN"],
  applications: ["STUDENT", "REVIEWER", "HEAD", "ADMIN"],
  evidence: ["REVIEWER", "HEAD"],
  approvals: ["REVIEWER", "HEAD"],
  letters: ["STUDENT", "REVIEWER", "HEAD", "ADMIN"],
  analytics: ["REVIEWER", "HEAD", "ADMIN"],
  sources: ["REVIEWER", "HEAD", "ADMIN"],
  settings: ["ADMIN", "HEAD"],
};

export const isStaff = (r: Role) => r !== "STUDENT";
export const canImportReference = (r: Role) => r === "ADMIN" || r === "HEAD";
export const canEditPolicy = (r: Role) => r === "ADMIN" || r === "HEAD";
export const canManageUsers = (r: Role) => r === "ADMIN";
