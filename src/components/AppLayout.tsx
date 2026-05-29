import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Building2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export function AppLayout() {
  const navigate = useNavigate();
  const { user, isPlatformAdmin, loading: authLoading, signOut } = useAuth();
  const { currentOrg, orgs, orgRole, loading: orgLoading, switchOrg } = useOrg();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    if (isPlatformAdmin) { navigate("/platform", { replace: true }); return; }
    if (!orgLoading && !currentOrg) { navigate("/create-org", { replace: true }); return; }
  }, [authLoading, orgLoading, user, isPlatformAdmin, currentOrg, navigate]);

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const userRoles = orgRole ? [orgRole] : [];

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar user={user} userRoles={userRoles} onLogout={handleLogout} currentOrg={currentOrg} />
        <main className="flex-1 overflow-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              {/* Org switcher */}
              {orgs.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                      <Building2 className="h-3.5 w-3.5" />
                      {currentOrg?.name}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {orgs.map((m) => (
                      <DropdownMenuItem
                        key={m.org_id}
                        onClick={() => switchOrg(m.org_id)}
                        className={m.org_id === currentOrg?.id ? "font-semibold" : ""}
                      >
                        <Building2 className="h-4 w-4 mr-2" />
                        {m.organization.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 h-9 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm hidden sm:inline">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {currentOrg && (
                  <>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{currentOrg.name}</div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <UserIcon className="h-4 w-4 mr-2" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
