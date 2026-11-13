import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { SideNav, Brand } from "@/components/SideNav";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Building2, ChevronDown, Menu } from "lucide-react";
import { toast } from "sonner";

export function AppLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isPlatformAdmin, loading: authLoading, signOut } = useAuth();
  const { currentOrg, orgs, orgRole, loading: orgLoading, switchOrg } = useOrg();

  const { data: mustChangePassword, isLoading: mcpLoading, refetch: refetchMcp } = useQuery({
    queryKey: ["must-change-password", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles" as never)
        .select("must_change_password")
        .eq("id", user!.id)
        .single();
      return !!(data as { must_change_password?: boolean } | null)?.must_change_password;
    },
    enabled: !!user && !isPlatformAdmin,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    // Console-only means the platform role AND no organisation. A platform
    // admin who belongs to one gets the normal app; the console stays
    // reachable from the organisation switcher.
    if (isPlatformAdmin && !orgLoading && !currentOrg) { navigate("/platform", { replace: true }); return; }
    if (!isPlatformAdmin && !orgLoading && !currentOrg) { navigate("/create-org", { replace: true }); return; }
  }, [authLoading, orgLoading, user, isPlatformAdmin, currentOrg, navigate]);

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  if (authLoading || orgLoading || (!!user && !isPlatformAdmin && mcpLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  // Mandatory: users flagged for a forced reset must set a new password first.
  if (user && !isPlatformAdmin && mustChangePassword) {
    return (
      <ForcePasswordChange
        userId={user.id}
        email={user.email}
        onDone={() => refetchMcp()}
        onSignOut={handleLogout}
      />
    );
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const userRoles = orgRole ? [orgRole] : [];
  const nav = <SideNav userRoles={userRoles} currentOrg={currentOrg} onNavigate={() => setMenuOpen(false)} />;
  const ghost = "w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-white";
  const account = (
    <div className="space-y-1">
      {orgs.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={`${ghost} h-9 text-xs`}>
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{currentOrg?.name}</span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-auto" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={`${ghost} h-11 px-2`}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm truncate">{user?.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
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
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border px-4 py-5">
        <div className="px-1 pb-5"><Brand name={currentOrg?.name} /></div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="pt-4 border-t border-sidebar-border">{account}</div>
      </aside>

      <div className="min-w-0">
        <header className="lg:hidden sticky top-0 z-20 bg-sidebar px-4 h-14 flex items-center justify-between">
          <Brand name={currentOrg?.name} />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="text-white hover:bg-sidebar-accent hover:text-white">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar text-sidebar-foreground border-sidebar-border w-72 flex flex-col p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="px-1 pb-5"><Brand name={currentOrg?.name} /></div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              <div className="pt-4 border-t border-sidebar-border">{account}</div>
            </SheetContent>
          </Sheet>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
