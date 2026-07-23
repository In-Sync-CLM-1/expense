export interface Permissions {
  isAdmin: boolean;
  isApprover: boolean;
  isAccounts: boolean;
  isMaker: boolean;
  canApproveExpenses: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canMarkReimbursed: boolean;
  canManageAdvances: boolean;
}

/**
 * Maker / Approver / Accounts. Admin is a superuser (keeps every
 * capability). "manager" is a legacy role value kept for backward
 * compatibility — it behaves like approver.
 */
export function getRolePermissions(roles: string[]): Permissions {
  const isAdmin = roles.includes("admin");
  const isApprover = isAdmin || roles.includes("approver") || roles.includes("manager");
  const isAccounts = isAdmin || roles.includes("accounts");
  const isMaker = !isApprover && !isAccounts;

  return {
    isAdmin,
    isApprover,
    isAccounts,
    isMaker,
    canApproveExpenses: isApprover,
    canViewReports: isAdmin || isAccounts,
    canManageUsers: isAdmin,
    canMarkReimbursed: isAccounts,
    canManageAdvances: isAccounts,
  };
}

export function getRoleDisplayName(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    approver: "Approver",
    accounts: "Accounts",
    employee: "Maker",
    manager: "Manager",
    platform_admin: "Platform Admin",
  };
  return map[role] || role;
}

export function getRoleVariant(
  role: string
): "default" | "secondary" | "outline" | "destructive" {
  if (role === "platform_admin") return "destructive";
  if (role === "admin") return "destructive";
  if (role === "approver" || role === "manager") return "secondary";
  if (role === "accounts") return "secondary";
  return "outline";
}
