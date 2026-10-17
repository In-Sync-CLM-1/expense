import { NavLink, useLocation } from "react-router-dom";
import { Home, FileText, ShieldCheck, HandCoins, BarChart3, Users as UsersIcon, Receipt } from "lucide-react";
import { getRolePermissions } from "@/lib/rolePermissions";
import { isRmplOrg } from "@/lib/rmplOrg";
import type { Organization } from "@/contexts/OrgContext";
import { useCurrentUser, usePendingApprovals } from "@/hooks/useExpenseClaims";
import { usePendingAdvanceRequests } from "@/hooks/useAdvanceRequests";
import { usePendingProjectOwnerApprovals } from "@/hooks/useProjectExpenses";

const link = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors";
const on = "bg-sidebar-accent text-sidebar-accent-foreground font-semibold";
const off = "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white";

const CLAIM_PATHS = ["/my-expenses", "/project-expenses", "/field-expenses"];

function Section({ children }: { children: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
      {children}
    </div>
  );
}

export function SideNav({ userRoles, currentOrg, onNavigate }: {
  userRoles: string[];
  currentOrg: Organization | null;
  onNavigate?: () => void;
}) {
  const perms = getRolePermissions(userRoles);
  const isRmpl = isRmplOrg(currentOrg?.id);
  const { pathname } = useLocation();
  const { data: user } = useCurrentUser();

  const showApprovals = perms.canApproveExpenses || isRmpl;
  const { data: pendingTravel } = usePendingApprovals(showApprovals ? user?.id : undefined);
  const { data: pendingAdvances } = usePendingAdvanceRequests(showApprovals ? user?.id : undefined);
  const { data: pendingProject } = usePendingProjectOwnerApprovals(showApprovals && isRmpl ? user?.id : undefined);
  const pending = (pendingTravel?.length ?? 0) + (pendingAdvances?.length ?? 0) + (pendingProject?.length ?? 0);

  const showManage = perms.canViewReports || perms.canManageUsers;
  const cls = (active: boolean) => `${link} ${active ? on : off}`;

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5" onClick={onNavigate}>
      <NavLink to="/dashboard" className={({ isActive }) => cls(isActive)}>
        <Home className="h-4 w-4" aria-hidden="true" />Home
      </NavLink>
      <NavLink to="/my-expenses" className={() => cls(CLAIM_PATHS.includes(pathname))}>
        <FileText className="h-4 w-4" aria-hidden="true" />My claims
      </NavLink>
      {(showApprovals || perms.canManageAdvances) && <Section>Workflow</Section>}
      {showApprovals && (
        <NavLink to="/approvals" className={({ isActive }) => cls(isActive)}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />Approvals
          {pending > 0 && (
            <span className="ml-auto rounded-full bg-amber-600 text-white text-xs px-2 py-0.5">{pending}</span>
          )}
        </NavLink>
      )}
      {perms.canManageAdvances && (
        <NavLink to="/advances" className={({ isActive }) => cls(isActive)}>
          <HandCoins className="h-4 w-4" aria-hidden="true" />Advances
        </NavLink>
      )}
      {showManage && <Section>Manage</Section>}
      {perms.canViewReports && (
        <NavLink to="/reports" className={({ isActive }) => cls(isActive)}>
          <BarChart3 className="h-4 w-4" aria-hidden="true" />Reports
        </NavLink>
      )}
      {perms.canManageUsers && (
        <NavLink to="/users" className={({ isActive }) => cls(isActive)}>
          <UsersIcon className="h-4 w-4" aria-hidden="true" />Users
        </NavLink>
      )}
    </nav>
  );
}

export function Brand({ name }: { name?: string }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0 min-w-0">
      <div className="p-2 rounded-xl bg-white/10 ring-1 ring-white/15">
        <Receipt className="h-4 w-4 text-[hsl(199_78%_62%)]" aria-hidden="true" />
      </div>
      <span className="font-display text-lg font-semibold tracking-tight text-white max-w-[170px] truncate">{name ?? "Expense"}</span>
    </div>
  );
}
