import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

export async function startTestDb() {
  container = await new PostgreSqlContainer().start();
  return {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
    url: container.getConnectionUri(),
  };
}

export async function stopTestDb() {
  if (container) {
    await container.stop();
  }
}
