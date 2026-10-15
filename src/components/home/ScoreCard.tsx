import { Award, Flame, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Score } from "@/lib/gamification";

export function ScoreCard({ score }: { score: Score }) {
  const pct = Math.round(score.progress * 100);
  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">Your filing level</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6 text-primary" aria-hidden="true" /> {score.level.name}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{score.points} points</div>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2"
            title="Claims in a row that were not returned"
          >
            <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <div className="text-lg font-bold leading-none">{score.cleanRun}</div>
              <div className="text-xs text-muted-foreground">clean run</div>
            </div>
          </div>
        </div>

        <div>
          <div
            className="h-2.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress to next level"
          >
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {score.nextLevel
              ? `${score.pointsToNext} more points to reach ${score.nextLevel.name}`
              : "You are at the top level. Keep it up."}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {score.badges.map((b) => (
            <span
              key={b.id}
              title={b.earned ? b.name : b.hint}
              className={
                b.earned
                  ? "inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-sm font-medium"
                  : "inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground"
              }
            >
              {!b.earned && <Lock className="h-3 w-3" aria-hidden="true" />}
              {b.earned ? b.name : b.hint}
            </span>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Points come from filing promptly, being approved first time and getting paid. Claim size never counts.
        </p>
      </CardContent>
    </Card>
  );
}
