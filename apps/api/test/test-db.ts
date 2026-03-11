import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Client } from 'pg';
import { applyMigrations } from '../src/persistence/migrations';

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  database: string;
  host: string;
  password: string;
  port: number;
  url: string;
  user: string;
};

export async function startTestDb() {
  const container = await new PostgreSqlContainer().start();
  return {
    container,
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
    url: container.getConnectionUri(),
  } satisfies TestDatabase;
}

export async function stopTestDb(testDb: TestDatabase) {
  if (!testDb) {
    return;
  }

  await testDb.container.stop();
}

export async function resetTestDb(connectionUri: string) {
  const client = new Client({
    connectionString: connectionUri,
  });

  await client.connect();
  try {
    await client.query('drop schema public cascade');
    await client.query('create schema public');
    await client.query('grant all on schema public to public');
    await client.query('grant all on schema public to current_user');
    await applyMigrations(client);
  } finally {
    await client.end();
  }
}

export async function readMailOutbox(connectionUri: string) {
  const client = new Client({
    connectionString: connectionUri,
  });

  await client.connect();
  try {
    const result = await client.query<{
      kind: string;
      recipient_email: string;
      subject: string;
    }>(
      `select kind, recipient_email, subject
       from mail_outbox
       order by created_at asc`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}
