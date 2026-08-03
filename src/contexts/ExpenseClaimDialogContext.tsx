import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { ExpenseClaimDialog } from "@/components/expenses/ExpenseClaimDialog";
import { setClaimDialogOpen } from "@/lib/pwaUpdateGate";

interface ExpenseClaimDialogContextValue {
  openNewClaim: () => void;
}

const ExpenseClaimDialogContext = createContext<ExpenseClaimDialogContextValue | undefined>(undefined);

// Mounted once in AppLayout, which stays mounted across every page under it.
// Keeping the dialog (and its in-progress form state) here — instead of inside
// whichever page opened it — means navigating to another page no longer
// unmounts it and discards what the employee was filling in.
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
