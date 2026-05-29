import { useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Building2, Users, LogOut, Receipt, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { to: "/platform",       label: "Command Center", icon: LayoutDashboard, end: true },
  { to: "/platform/orgs",  label: "Organisations",  icon: Building2 },
  { to: "/platform/users", label: "All Users",       icon: Users },
];

export default function PlatformLayout() {
  const navigate = useNavigate();
  const { user, isPlatformAdmin, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !isPlatformAdmin) navigate("/login", { replace: true });
  }, [loading, isPlatformAdmin, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "PA";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-sidebar-primary rounded-lg">
              <Receipt className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <span className="text-sm font-bold text-sidebar-foreground">Expense Claims</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 px-1">
            <ShieldAlert className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-xs font-semibold text-yellow-500 uppercase tracking-wide">
              Platform Admin
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                isActive
                  ? "flex items-center gap-2.5 px-3 py-2 rounded-md bg-sidebar-accent text-sidebar-accent-foreground font-semibold text-sm w-full"
                  : "flex items-center gap-2.5 px-3 py-2 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground text-sm w-full transition-colors"
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground gap-2 px-3"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
          <div />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 h-9 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-yellow-500 text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">{user?.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
