import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Receipt } from "lucide-react";
import { getRolePermissions } from "@/lib/rolePermissions";
import { isRmplOrg } from "@/lib/rmplOrg";
import type { Organization } from "@/contexts/OrgContext";
import { useCurrentUser, usePendingApprovals } from "@/hooks/useExpenseClaims";
import { usePendingAdvanceRequests } from "@/hooks/useAdvanceRequests";
import { usePendingProjectOwnerApprovals } from "@/hooks/useProjectExpenses";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

const link = "px-1 py-4 text-sm whitespace-nowrap border-b-2 transition-colors";
const on = "border-primary text-foreground font-semibold";
const off = "border-transparent text-muted-foreground hover:text-foreground";

const CLAIM_PATHS = ["/my-expenses", "/project-expenses", "/field-expenses"];

export function TopNav({ userRoles, currentOrg }: { userRoles: string[]; currentOrg: Organization | null }) {
  const perms = getRolePermissions(userRoles);
  const isRmpl = isRmplOrg(currentOrg?.id);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: user } = useCurrentUser();

  const showApprovals = perms.canApproveExpenses || isRmpl;
  const { data: pendingTravel } = usePendingApprovals(showApprovals ? user?.id : undefined);
  const { data: pendingAdvances } = usePendingAdvanceRequests(showApprovals ? user?.id : undefined);
  const { data: pendingProject } = usePendingProjectOwnerApprovals(showApprovals && isRmpl ? user?.id : undefined);
  const pending = (pendingTravel?.length ?? 0) + (pendingAdvances?.length ?? 0) + (pendingProject?.length ?? 0);

  const showManage = perms.canViewReports || perms.canManageUsers;

  return (
    <nav aria-label="Main" className="flex items-center gap-5 sm:gap-7 overflow-x-auto">
      <NavLink to="/dashboard" className={({ isActive }) => `${link} ${isActive ? on : off}`}>Home</NavLink>
      <NavLink
        to="/my-expenses"
        className={() => `${link} ${CLAIM_PATHS.includes(pathname) ? on : off}`}
      >
        My claims
      </NavLink>
      {showApprovals && (
        <NavLink to="/approvals" className={({ isActive }) => `${link} ${isActive ? on : off}`}>
          Approvals
          {pending > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-700 text-white text-xs px-1.5 py-0.5 align-middle">{pending}</span>
          )}
        </NavLink>
      )}
      {perms.canManageAdvances && (
        <NavLink to="/advances" className={({ isActive }) => `${link} ${isActive ? on : off}`}>Advances</NavLink>
      )}
      {showManage && (
        <DropdownMenu>
          <DropdownMenuTrigger className={`${link} ${["/reports", "/users"].includes(pathname) ? on : off} flex items-center gap-1`}>
            Manage <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {perms.canViewReports && <DropdownMenuItem onClick={() => navigate("/reports")}>Reports</DropdownMenuItem>}
            {perms.canManageUsers && <DropdownMenuItem onClick={() => navigate("/users")}>Users</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

export function Brand({ name }: { name?: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="p-2 rounded-xl bg-[hsl(var(--deep-blue))] shadow-sm"><Receipt className="h-4 w-4 text-[hsl(199_78%_62%)]" aria-hidden="true" /></div>
      <span className="font-display text-lg font-semibold tracking-tight hidden md:inline max-w-[220px] truncate">{name ?? "Expense"}</span>
    </div>
  );
}
