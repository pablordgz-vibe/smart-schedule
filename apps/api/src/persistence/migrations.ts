import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type ClientBase, type PoolClient } from 'pg';

type DatabaseClient = Pool | ClientBase;

type MigrationFile = {
  name: string;
  sql: string;
};

const schemaMigrationsTable = 'schema_migrations';
const migrationsLockId = 'smart_schedule_schema_migrations';

function isPool(connection: DatabaseClient): connection is Pool {
  return connection instanceof Pool;
}

export function resolveMigrationsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), 'apps/api/migrations'),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error('No API migration directory could be resolved.');
  }

  return resolved;
}

export async function readMigrationFiles(
  migrationsDir = resolveMigrationsDir(),
): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fileNames.map(async (fileName) => ({
      name: fileName,
      sql: await readFile(path.join(migrationsDir, fileName), 'utf8'),
    })),
  );
}

export async function applyMigrations(
  databaseClient: DatabaseClient,
  migrationsDir = resolveMigrationsDir(),
) {
  const client = isPool(databaseClient)
    ? await databaseClient.connect()
    : databaseClient;
  let lockAcquired = false;

  try {
    await client.query(`select pg_advisory_lock(hashtext($1))`, [
      migrationsLockId,
    ]);
    lockAcquired = true;

    await client.query(`
    create table if not exists ${schemaMigrationsTable} (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

    const migrationFiles = await readMigrationFiles(migrationsDir);
    if (migrationFiles.length === 0) {
      return [];
    }

    const appliedResult = await client.query<{ id: string }>(
      `select id from ${schemaMigrationsTable}`,
    );
    const applied = new Set(appliedResult.rows.map((row) => row.id));
    const executed: string[] = [];

    for (const migration of migrationFiles) {
      if (applied.has(migration.name)) {
        continue;
      }

      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query(
          `insert into ${schemaMigrationsTable} (id) values ($1)`,
          [migration.name],
        );
        await client.query('commit');
        executed.push(migration.name);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    return executed;
  } finally {
    if (lockAcquired) {
      await client.query(`select pg_advisory_unlock(hashtext($1))`, [
        migrationsLockId,
      ]);
    }

    if (isPool(databaseClient)) {
      (client as PoolClient).release();
    }
  }
}
