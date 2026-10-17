import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export type Tone = "primary" | "green" | "amber" | "red" | "neutral";

const STRIPE: Record<Tone, string> = {
  primary: "bg-primary",
  green: "bg-emerald-600",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-border",
};

/** Editorial stat tile: tone-colored left stripe, small caps label, serif figure. */
export function StatTile({ label, value, note, icon, tone = "primary" }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${STRIPE[tone]}`} aria-hidden="true" />
      <div className="px-5 py-4 pl-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="font-display text-3xl font-semibold mt-1.5 tabular-nums">{value}</div>
        {note && <div className="text-sm text-muted-foreground mt-1">{note}</div>}
      </div>
    </Card>
  );
}

export function PageTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-1.5">{eyebrow}</div>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{children}</h1>
    </>
  );
}
