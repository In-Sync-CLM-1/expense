// Filing-habit score. Rewards good behaviour (filing promptly, getting
// approved first time, getting paid) and never the size of a claim, so
// there is no incentive to inflate amounts. Everything is derived from
// claim headers already loaded for the Home screen; nothing is stored.

export interface ScoreClaim {
  kind: "travel" | "project" | "field";
  status: string;
  submitted_at: string | null;
  /** Only travel claims carry an end date to measure promptness against. */
  endDate?: string | null;
}

export interface Level {
  name: string;
  min: number;
}

export const LEVELS: Level[] = [
  { name: "Starter", min: 0 },
  { name: "Regular", min: 40 },
  { name: "Pro", min: 120 },
  { name: "Champion", min: 250 },
];

export interface Badge {
  id: string;
  name: string;
  hint: string;
  earned: boolean;
}

export interface Score {
  points: number;
  level: Level;
  nextLevel: Level | null;
  /** 0..1 progress from the current level to the next. */
  progress: number;
  pointsToNext: number;
  cleanRun: number;
  badges: Badge[];
  submitted: number;
}

const DAY = 86_400_000;
const isSubmitted = (c: ScoreClaim) => !!c.submitted_at && c.status !== "draft";
const isApproved = (c: ScoreClaim) => c.status === "approved" || c.status === "reimbursed";
const isReturned = (c: ScoreClaim) => c.status === "rejected";

export function computeScore(claims: ScoreClaim[]): Score {
  const filed = claims.filter(isSubmitted);
  let points = 0;
  let onTime = 0;
  let paid = 0;

  for (const c of filed) {
    points += 10;
    if (isApproved(c)) points += 10;
    if (c.status === "reimbursed") { points += 5; paid++; }
    if (c.endDate && c.submitted_at) {
      const gap = new Date(c.submitted_at).getTime() - new Date(c.endDate).getTime();
      if (gap <= 7 * DAY) { points += 5; onTime++; }
    }
  }

  // Clean run: newest-first claims in a row that were not returned.
  const newestFirst = [...filed].sort(
    (a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime(),
  );
  let cleanRun = 0;
  for (const c of newestFirst) {
    if (isReturned(c)) break;
    cleanRun++;
  }

  const level = [...LEVELS].reverse().find((l) => points >= l.min) ?? LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
  const progress = nextLevel ? (points - level.min) / (nextLevel.min - level.min) : 1;

  const badges: Badge[] = [
    { id: "first", name: "First claim", hint: "File your first claim", earned: filed.length >= 1 },
    { id: "fast", name: "Fast filer", hint: "File 3 travel claims within 7 days of returning", earned: onTime >= 3 },
    { id: "clean", name: "Clean run", hint: "5 claims in a row without being returned", earned: cleanRun >= 5 },
    { id: "paid", name: "Paid up", hint: "Get a claim paid", earned: paid >= 1 },
    { id: "regular", name: "Regular", hint: "File 10 claims", earned: filed.length >= 10 },
  ];

  return {
    points,
    level,
    nextLevel,
    progress,
    pointsToNext: nextLevel ? nextLevel.min - points : 0,
    cleanRun,
    badges,
    submitted: filed.length,
  };
}
