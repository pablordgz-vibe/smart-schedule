import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { envSchema } from '@smart-schedule/config';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { applyMigrations } from './migrations';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly env = envSchema.parse(process.env);
  private readonly pool = new Pool({
    connectionString: this.env.DATABASE_URL,
  });

  async onModuleInit() {
    await this.pool.query('select 1');
    const applied = await applyMigrations(this.pool);
    if (applied.length > 0) {
      this.logger.log(`Applied migrations: ${applied.join(', ')}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<TResult extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<TResult>> {
    return this.pool.query<TResult>(text, params);
  }

  getPool() {
    return this.pool;
  }
}
