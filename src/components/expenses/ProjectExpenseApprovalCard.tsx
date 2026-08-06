import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Briefcase, MapPin, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useProjectExpenseClaimDetail, type ProjectExpenseClaim } from "@/hooks/useProjectExpenses";
import { useState } from "react";

interface Props {
  claim: ProjectExpenseClaim;
  onApprove: () => void;
  onReject: () => void;
}

export function ProjectExpenseApprovalCard({ claim, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useProjectExpenseClaimDetail(expanded ? claim.id : undefined);

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              {claim.project_name}
              {claim.project_number && <span className="text-sm font-normal text-muted-foreground">({claim.project_number})</span>}
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{claim.traveller_name}</span>
              {claim.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{claim.city}</span>}
              {claim.period && <span>{claim.period}</span>}
            </div>
            {claim.activity && <p className="text-sm text-muted-foreground mt-1">{claim.activity}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">₹{Number(claim.actual_expense_total).toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground">
              Advance ₹{Number(claim.advance_amount).toLocaleString("en-IN")} · Net{" "}
              {claim.net_balance < 0 ? "Payable" : "Left"} ₹{Math.abs(Number(claim.net_balance)).toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide" : "View"} expense details
        </Button>

        {expanded && detail?.items && (
          <div className="space-y-1.5 pl-3 border-l-2 border-muted">
            {detail.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1">
                <div>
                  <span className="text-muted-foreground">{format(new Date(item.line_date), "MMM d")} · {item.description || item.mode_of_transport || "—"}</span>
                  {item.receipt_url && (
                    <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <span className="font-medium whitespace-nowrap">₹{Number(item.grand_total).toLocaleString("en-IN")}</span>
              </div>
            ))}
            {detail.travel_logs && detail.travel_logs.length > 0 && (
              <div className="pt-2">
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

        <Separator />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onReject}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
          <Button size="sm" onClick={onApprove}><CheckCircle className="h-4 w-4 mr-1" /> Approve</Button>
        </div>
      </CardContent>
    </Card>
  );
}
