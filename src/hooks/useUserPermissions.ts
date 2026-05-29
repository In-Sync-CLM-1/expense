import { useState, useEffect } from "react";
import { getRolePermissions, type Permissions } from "@/lib/rolePermissions";
import { supabase } from "@/integrations/supabase/client";
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
  const [hasSubordinates, setHasSubordinates] = useState(false);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setSubLoading(false); return; }
    supabase
      .from("profiles" as never)
      .select("id", { count: "exact", head: true })
      .eq("reports_to", user.id)
      .then(({ count }) => {
        setHasSubordinates((count ?? 0) > 0);
        setSubLoading(false);
      });
  }, [user?.id]);

  const roles = orgRole ? [orgRole] : [];
  const permissions = getRolePermissions(roles, hasSubordinates);
  const isLoading = authLoading || orgLoading || subLoading;

  return { permissions, userRoles: roles, userId: user?.id, isLoading };
}
