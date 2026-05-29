import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

interface Props {
  children: React.ReactNode;
  requireOrgRole?: "admin" | "manager";
}

export function ProtectedRoute({ children, requireOrgRole }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, orgRole, isPlatformAdmin, loading: orgLoading } = useOrg();

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Platform admins bypass all org checks
  if (isPlatformAdmin) return <>{children}</>;

  if (!currentOrg) return <Navigate to="/create-org" replace />;

  if (requireOrgRole === "admin" && orgRole !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You need admin privileges for this page.</p>
        </div>
      </div>
    );
  }

  if (requireOrgRole === "manager" && orgRole === "employee") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You need manager or admin privileges for this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
