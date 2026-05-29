import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Calendar, MapPin, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { getExpenseTypeLabel, type ExpenseClaim } from "@/hooks/useExpenseClaims";

interface Props {
  claim: ExpenseClaim;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({ claim, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);

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

        {/* Expandable items */}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide" : "View"} expense details
        </Button>

        {expanded && claim.items && (
          <div className="space-y-1.5 pl-3 border-l-2 border-muted">
            {claim.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1">
                <div>
                  <Badge variant="outline" className="text-xs mr-2">
                    {getExpenseTypeLabel(item.expense_type)}
                  </Badge>
                  <span className="text-muted-foreground">{item.description}</span>
                  {item.receipt_url && (
                    <a
                      href={item.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-500 inline-flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <span className="font-medium whitespace-nowrap">
                  ₹{Number(item.amount).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
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
