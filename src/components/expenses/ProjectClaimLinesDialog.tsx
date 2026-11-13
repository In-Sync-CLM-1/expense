import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useProjectExpenseClaimDetail } from "@/hooks/useProjectExpenses";
import { FileStrip, receiptFiles } from "@/components/expenses/SupportingFiles";

interface Props {
  claim: { id: string; project_name: string; project_number?: string | null; traveller_name: string } | null;
  onClose: () => void;
}

/** Read-only view of a project claim's expense lines, for Accounts. */
export function ProjectClaimLinesDialog({ claim, onClose }: Props) {
  const { data: detail, isLoading } = useProjectExpenseClaimDetail(claim?.id);

  return (
    <Dialog open={!!claim} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {claim?.project_name}
            {claim?.project_number && <span className="ml-2 text-sm font-normal text-muted-foreground">({claim.project_number})</span>}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{claim?.traveller_name}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !detail?.items?.length ? (
          <p className="text-center text-sm text-muted-foreground py-8">This claim has no expense lines.</p>
        ) : (
          <div className="space-y-3">
            {detail.items.map((item) => (
              <div key={item.id} className="space-y-1.5 text-sm border rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {format(new Date(item.line_date), "MMM d, yyyy")} · {item.description || "Expense line"}
                  </span>
                  <span className="font-medium whitespace-nowrap">₹{Number(item.grand_total).toLocaleString("en-IN")}</span>
                </div>
                <FileStrip files={receiptFiles(item)} />
              </div>
            ))}
            {detail.travel_logs && detail.travel_logs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Travel Log</p>
                {detail.travel_logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-xs py-0.5 text-muted-foreground">
                    <span>{log.from_place} → {log.to_place} ({log.mode})</span>
                    <span>₹{Number(log.total).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
