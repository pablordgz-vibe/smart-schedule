import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const { Client } = pg;
const repoRoot = resolve(process.cwd());
const migrationsDir = join(repoRoot, "apps", "api", "migrations");

async function readMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(join(migrationsDir, name), "utf8"),
    })),
  );
}

if (!existsSync(migrationsDir)) {
  console.log("Migration check passed: no migration directory is present.");
  process.exit(0);
}

const migrations = await readMigrationFiles();
if (migrations.length === 0) {
  console.log(
    "Migration check passed: migration directory exists but is empty.",
  );
  process.exit(0);
}

const container = await new PostgreSqlContainer().start();
const client = new Client({
  connectionString: container.getConnectionUri(),
});

try {
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const migration of migrations) {
    await client.query("begin");
    try {
      await client.query(migration.sql);
      await client.query(`insert into schema_migrations (id) values ($1)`, [
        migration.name,
      ]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration failed (${migration.name}): ${String(error)}`);
    }
  }

  console.log(
    `Migration check passed: applied ${migrations.length} migration(s) against a disposable PostgreSQL instance.`,
  );
} finally {
  await client.end().catch(() => undefined);
  await container.stop();
}
