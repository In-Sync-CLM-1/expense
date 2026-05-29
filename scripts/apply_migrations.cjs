// Apply migrations via Supabase Management API SQL endpoint
const fs = require("fs");
const path = require("path");
const https = require("https");

const PAT = process.env.SUPABASE_PAT;
const REF = process.env.SUPABASE_PROJECT_REF;
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

if (!PAT || !REF) {
  console.error("Set SUPABASE_PAT and SUPABASE_PROJECT_REF");
  process.exit(1);
}

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(data)
            : reject(new Error(`HTTP ${res.statusCode}: ${data}`)),
        );
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    process.stdout.write(`Applying ${f} ... `);
    try {
      await runSql(sql);
      console.log("OK");
    } catch (e) {
      console.log("FAIL");
      console.error(e.message.slice(0, 800));
      process.exit(1);
    }
  }
  console.log("All migrations applied.");
})();
