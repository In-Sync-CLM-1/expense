import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { ExpenseClaimDialog } from "@/components/expenses/ExpenseClaimDialog";
import { setClaimDialogOpen } from "@/lib/pwaUpdateGate";

interface ExpenseClaimDialogContextValue {
  openNewClaim: () => void;
}

const ExpenseClaimDialogContext = createContext<ExpenseClaimDialogContextValue | undefined>(undefined);

// Mounted once at the top of App.tsx, above the router and above every
// auth/org loading gate (AppLayout, PlatformLayout). Keeping the dialog (and
// its in-progress form state) here — instead of inside whichever page opened
// it, or inside a gated layout — means neither an in-app navigation nor a
// gate tearing its subtree down (e.g. Supabase re-validating the session on
// tab-focus regain) can unmount it and discard what the employee was
// filling in. It only ever goes away when they close it themselves.
export function ExpenseClaimDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const { user } = useAuth();
  const { currentOrg } = useOrg();

  const setOpen = (next: boolean) => {
    setOpenState(next);
    setClaimDialogOpen(next);
  };

  return (
    <ExpenseClaimDialogContext.Provider value={{ openNewClaim: () => setOpen(true) }}>
      {children}
      {user && (
        <ExpenseClaimDialog
          open={open}
          onOpenChange={setOpen}
          userId={user.id}
          orgId={currentOrg?.id}
        />
      )}
    </ExpenseClaimDialogContext.Provider>
  );
}

export function useExpenseClaimDialog() {
  const ctx = useContext(ExpenseClaimDialogContext);
  if (!ctx) throw new Error("useExpenseClaimDialog must be used within ExpenseClaimDialogProvider");
  return ctx;
}
