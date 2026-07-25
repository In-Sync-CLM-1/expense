import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  industry: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMembership {
  org_id: string;
  role: string;
  roles: string[];
  is_active: boolean;
  organization: Organization;
}

interface OrgContextType {
  currentOrg: Organization | null;
  orgRole: string | null;
  orgRoles: string[];
  orgs: OrgMembership[];
  isPlatformAdmin: boolean;
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgRole: null,
  orgRoles: [],
  orgs: [],
  isPlatformAdmin: false,
  loading: true,
  switchOrg: () => {},
  refreshOrgs: async () => {},
});

export const useOrg = () => useContext(OrgContext);

const LS_KEY = "expense_current_org_id";

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isPlatformAdmin, loading: authLoading } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [orgRoles, setOrgRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;
  if (userIdRef.current !== userId) {
    userIdRef.current = userId;
  }

  const fetchOrgs = useCallback(async () => {
    if (authLoading) return;

    const uid = userIdRef.current;
    if (!uid || isPlatformAdmin) {
      setOrgs([]);
      setCurrentOrg(null);
      setOrgRole(null);
      setOrgRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships } = await supabase
      .from("org_memberships" as never)
      .select("org_id, role, roles, is_active, organizations(*)")
      .eq("user_id", uid)
      .eq("is_active", true);

    const mapped: OrgMembership[] = ((memberships ?? []) as Array<{
      org_id: string;
      role: string;
      roles: string[] | null;
      is_active: boolean;
      organizations: Organization;
    }>).map((m) => ({
      org_id: m.org_id,
      role: m.role,
      roles: m.roles && m.roles.length ? m.roles : [m.role],
      is_active: m.is_active,
      organization: m.organizations,
    }));

    setOrgs(mapped);

    const savedOrgId = localStorage.getItem(LS_KEY);
    const saved = mapped.find((m) => m.org_id === savedOrgId);

    if (saved) {
      setCurrentOrg(saved.organization);
      setOrgRole(saved.role);
      setOrgRoles(saved.roles);
    } else if (mapped.length > 0) {
      setCurrentOrg(mapped[0].organization);
      setOrgRole(mapped[0].role);
      setOrgRoles(mapped[0].roles);
      localStorage.setItem(LS_KEY, mapped[0].org_id);
    } else {
      setCurrentOrg(null);
      setOrgRole(null);
      setOrgRoles([]);
    }

    setLoading(false);
  }, [userId, isPlatformAdmin, authLoading]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const switchOrg = (orgId: string) => {
    const membership = orgs.find((m) => m.org_id === orgId);
    if (membership) {
      setCurrentOrg(membership.organization);
      setOrgRole(membership.role);
      setOrgRoles(membership.roles);
      localStorage.setItem(LS_KEY, orgId);
    }
  };

  return (
    <OrgContext.Provider value={{
      currentOrg,
      orgRole,
      orgRoles,
      orgs,
      isPlatformAdmin,
      loading,
      switchOrg,
      refreshOrgs: fetchOrgs,
    }}>
      {children}
    </OrgContext.Provider>
  );
}
