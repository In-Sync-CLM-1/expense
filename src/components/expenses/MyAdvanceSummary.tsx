import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { HandCoins } from "lucide-react";
import { useMyAdvanceSummary, advanceKind } from "@/hooks/useAdvances";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * The signed-in employee's advance position, per trip. Renders nothing
 * unless the employee actually holds advances.
 */
export function MyAdvanceSummary({ orgId }: { orgId?: string }) {
  const { data: summary } = useMyAdvanceSummary(orgId);
  if (!summary || summary.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <HandCoins className="h-5 w-5" /> My Advances
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trip</TableHead>
                <TableHead className="text-right">Advance Received (₹)</TableHead>
                <TableHead className="text-right">Expenses Approved (₹)</TableHead>
                <TableHead className="text-right">Balance (₹)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((r) => {
                const balance = Number(r.balance || 0);
                const kind = advanceKind(balance);
                const tone =
                  kind === "payable" ? "text-green-700 dark:text-green-400"
                  : kind === "unspent" ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground";
                return (
                  <TableRow key={r.claim_id ?? "general"}>
                    <TableCell className="text-sm">
                      {r.trip_title ?? <span className="text-muted-foreground">General</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inr(Number(r.advances_total || 0))}</TableCell>
                    <TableCell className="text-right">{inr(Number(r.expenses_total || 0))}</TableCell>
                    <TableCell className={`text-right font-semibold ${tone}`}>{inr(Math.abs(balance))}</TableCell>
                    <TableCell>
                      <Badge variant={kind === "settled" ? "outline" : "secondary"}>
                        {kind === "unspent" ? "To return" : kind === "payable" ? "Due to you" : "Settled"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
