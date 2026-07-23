import { getRolePermissions, type Permissions } from "@/lib/rolePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

export function useUserPermissions(): {
  permissions: Permissions;
  userRoles: string[];
  userId: string | undefined;
  isLoading: boolean;
} {
  const { user, loading: authLoading } = useAuth();
  const { orgRole, loading: orgLoading } = useOrg();

  const roles = orgRole ? [orgRole] : [];
  const permissions = getRolePermissions(roles);
  const isLoading = authLoading || orgLoading;

  return { permissions, userRoles: roles, userId: user?.id, isLoading };
}
