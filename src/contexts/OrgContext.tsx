import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

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
  switchOrg: (orgId: string) => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgRole: null,
  orgRoles: [],
  orgs: [],
  isPlatformAdmin: false,
  loading: true,
  switchOrg: async () => {},
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
    // A platform admin used to be given no organisations at all. That is right
    // for a console-only account, but wrong for someone who also works inside
    // one — they arrive from another tool expecting their workspace. Load the
    // memberships either way; having none still leaves them console-only.
    if (!uid) {
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

    // The saved choice lives on the profile so it follows the person between
    // devices; local storage is only a fallback for a profile that has not
    // been given one yet.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("active_org_id")
      .eq("id", uid)
      .maybeSingle();

    const savedOrgId =
      (profileRow as { active_org_id: string | null } | null)?.active_org_id ??
      localStorage.getItem(LS_KEY);
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

  const switchOrg = async (orgId: string) => {
    const membership = orgs.find((m) => m.org_id === orgId);
    if (!membership) return;

    // Same call as every other app in the fleet. It refuses any organisation
    // the caller is not a member of, so the switch cannot put the UI somewhere
    // the database would not serve.
    const { error } = await supabase.rpc("set_active_org", { p_org_id: orgId });
    if (error) {
      toast.error(error.message);
      return;
    }

    setCurrentOrg(membership.organization);
    setOrgRole(membership.role);
    setOrgRoles(membership.roles);
    localStorage.setItem(LS_KEY, orgId);
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
