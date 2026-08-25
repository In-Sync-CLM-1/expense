// Single-purpose scheduler: every 15 min, ask Expense's sync-rmpl-employees
// function to reconcile the Redefine org against RMPL's live employee
// roster. Same "one worker per job" shape as RMPL's own cron-worker — a
// slow/failing sync can't affect anything else, and the job is visible and
// disable-able on its own in the Cloudflare dashboard.
async function tick(env) {
  const res = await fetch(env.SYNC_FUNCTION_URL, {
    method: "POST",
    headers: { "x-sync-secret": env.SYNC_SECRET, "Content-Type": "application/json" },
  }).catch((e) => new Response(String(e), { status: 502 }));
  const body = await res.text().catch(() => "");
  return new Response(`sync-rmpl-employees: ${res.status} ${body}\n`);
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(tick(env)); },
  // Manual kick / health check.
  async fetch(_req, env) { return tick(env); },
};
