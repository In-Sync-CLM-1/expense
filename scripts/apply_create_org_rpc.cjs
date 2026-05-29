// One-off applier for 20260423000001_create_organization_rpc.sql.
// Reuses the same pooler URL as migrate.cjs. Safe to re-run (create or replace).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB_URL =
  "postgresql://postgres:7vN%24F9%232xP%26z%40qL1@db.fozoerpeynkehpchfxcj.supabase.co:5432/postgres";

const sql = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260423000001_create_organization_rpc.sql"),
  "utf8",
);

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied: create_organization RPC");
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
