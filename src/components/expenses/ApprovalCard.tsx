import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Calendar, MapPin, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { FileStrip, receiptFiles } from "@/components/expenses/SupportingFiles";
import { getExpenseTypeLabel, type ExpenseClaim, type ExpenseItem } from "@/hooks/useExpenseClaims";

function itemFlagReason(item: ExpenseItem): string | null {
  const reasons: string[] = [];
  if (item.flag_tampering) {
    reasons.push(item.flag_tampering_reason || "Receipt image shows possible signs of alteration.");
  }
  if (item.flag_amount_mismatch && item.ai_declared_amount != null) {
    reasons.push(
      `Claimed ₹${Number(item.amount).toLocaleString("en-IN")} but the receipt reading was ₹${Number(item.ai_declared_amount).toLocaleString("en-IN")}.`
    );
  }
  return reasons.length ? reasons.join(" ") : null;
}

interface Props {
  claim: ExpenseClaim;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({ claim, onApprove, onReject }: Props) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">{claim.trip_title}</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {claim.profiles?.full_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(claim.trip_start_date), "MMM d")} –{" "}
                {format(new Date(claim.trip_end_date), "MMM d, yyyy")}
              </span>
              {claim.destination && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {claim.destination}
                </span>
              )}
            </div>
            {claim.purpose && (
              <p className="text-sm text-muted-foreground mt-1">{claim.purpose}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">
              ₹{Number(claim.total_amount).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">{claim.items?.length ?? 0} items</p>
          </div>
        </div>

        {/* Items and their receipts: always visible so the approver never has to hunt for proof */}
        {claim.items && (
          <div className="space-y-3 pl-3 border-l-2 border-muted">
            {claim.items.map((item) => {
              const flagReason = itemFlagReason(item);
              return (
                <div key={item.id} className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Badge variant="outline" className="text-xs mr-2">
                        {getExpenseTypeLabel(item.expense_type)}
                      </Badge>
                      <span className="text-muted-foreground">{item.description}</span>
                      {flagReason && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-2 inline-flex items-center gap-1 text-destructive align-middle">
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{flagReason}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <span className="font-medium whitespace-nowrap">
                      ₹{Number(item.amount).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <FileStrip files={receiptFiles(item)} />
                </div>
              );
            })}
          </div>
        )}

        {(claim.proof_urls?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Claim proofs</p>
            <FileStrip files={claim.proof_urls.map((p) => ({ url: p.url, name: p.name }))} />
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onReject}>
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button size="sm" onClick={onApprove}>
            <CheckCircle className="h-4 w-4 mr-1" /> Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
