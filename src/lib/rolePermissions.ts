export interface Permissions {
  isAdmin: boolean;
  isManager: boolean;
  canApproveExpenses: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canMarkReimbursed: boolean;
}

export function getRolePermissions(
  roles: string[],
  hasSubordinates = false
): Permissions {
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  return {
    isAdmin,
    isManager,
    canApproveExpenses: isManager || hasSubordinates,
    canViewReports: isAdmin,
    canManageUsers: isAdmin,
    canMarkReimbursed: isAdmin,
  };
}

export function getRoleDisplayName(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    employee: "Employee",
    platform_admin: "Platform Admin",
  };
  return map[role] || role;
}

export function getRoleVariant(
  role: string
): "default" | "secondary" | "outline" | "destructive" {
  if (role === "platform_admin") return "destructive";
  if (role === "admin") return "destructive";
  if (role === "manager") return "secondary";
  return "outline";
}
