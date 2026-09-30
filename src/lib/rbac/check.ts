import { ForbiddenError } from "@/lib/errors";
import { MATRIX, type Permission, type Role } from "./roles";

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(`role "${role}" lacks "${permission}"`);
  }
}
