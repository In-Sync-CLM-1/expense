import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import CreateOrg from "./pages/CreateOrg";
import Dashboard from "./pages/Dashboard";
import MyExpenses from "./pages/MyExpenses";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import MyProfile from "./pages/MyProfile";
import NotFound from "./pages/NotFound";

// Platform admin
import PlatformLayout from "./pages/platform/PlatformLayout";
import CommandCenter from "./pages/platform/CommandCenter";
import PlatformOrgs from "./pages/platform/PlatformOrgs";
import PlatformUsers from "./pages/platform/PlatformUsers";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrgProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/create-org" element={<CreateOrg />} />

                  {/* Platform Admin — has its own layout + auth guard */}
                  <Route path="/platform" element={<PlatformLayout />}>
                    <Route index element={<CommandCenter />} />
                    <Route path="orgs" element={<PlatformOrgs />} />
                    <Route path="users" element={<PlatformUsers />} />
                  </Route>

                  {/* Regular app (auth guard + org guard in AppLayout) */}
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard"   element={<Dashboard />} />
                    <Route path="/my-expenses" element={<MyExpenses />} />
                    <Route path="/approvals"   element={<Approvals />} />
                    <Route path="/reports"     element={<Reports />} />
                    <Route path="/users"       element={<Users />} />
                    <Route path="/profile"     element={<MyProfile />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </OrgProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
