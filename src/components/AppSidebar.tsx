import { NavLink } from "react-router-dom";
import { User } from "@supabase/supabase-js";
import {
  LayoutDashboard, Plane, ShieldCheck, BarChart3, Users, UserCircle, LogOut, Receipt,
} from "lucide-react";
import { getRolePermissions } from "@/lib/rolePermissions";
import type { Organization } from "@/contexts/OrgContext";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface Props {
  user: User | null;
  userRoles: string[];
  onLogout: () => void;
  currentOrg: Organization | null;
}

export function AppSidebar({ user: _user, userRoles, onLogout, currentOrg }: Props) {
  const perms = getRolePermissions(userRoles);

  return (
    <Sidebar>
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sidebar-primary rounded-lg">
            <Receipt className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground truncate">
              {currentOrg?.name ?? "Expense Claims"}
            </p>
            <p className="text-xs text-sidebar-foreground/60">Expense Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* My Expenses */}
        <SidebarGroup>
          <SidebarGroupLabel>My Expenses</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/my-expenses" icon={<Plane className="h-4 w-4" />} label="My Claims" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Approvals */}
        {perms.canApproveExpenses && (
          <SidebarGroup>
            <SidebarGroupLabel>Approvals</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/approvals" icon={<ShieldCheck className="h-4 w-4" />} label="Expense Approvals" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Reports */}
        {perms.canViewReports && (
          <SidebarGroup>
            <SidebarGroupLabel>Reports</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/reports" icon={<BarChart3 className="h-4 w-4" />} label="Expense Reports" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin */}
        {perms.canManageUsers && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/users" icon={<Users className="h-4 w-4" />} label="Users" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        <NavItem to="/profile" icon={<UserCircle className="h-4 w-4" />} label="My Profile" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground gap-2 px-2"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to={to}
          className={({ isActive }) =>
            isActive
              ? "flex items-center gap-2 px-2 py-1.5 rounded-md bg-sidebar-accent text-sidebar-accent-foreground font-semibold text-sm w-full"
              : "flex items-center gap-2 px-2 py-1.5 rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground text-sm w-full transition-colors"
          }
        >
          {icon}
          {label}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
