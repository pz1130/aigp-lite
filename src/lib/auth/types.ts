import type { Role } from "@/lib/rbac/roles";

export interface SessionContext {
  userId: string;
  email: string;
  orgId: string;
  role: Role;
}
