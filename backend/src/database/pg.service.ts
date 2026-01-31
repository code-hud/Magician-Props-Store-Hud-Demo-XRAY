import { Injectable, Scope } from '@nestjs/common';
import { Client, QueryResult } from 'pg';

@Injectable({ scope: Scope.REQUEST })
export class PgService {
  private client: Client;
  private connected = false;

  private async ensureConnected() {
    if (!this.connected) {
      this.client = new Client({
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'magician_props_store',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      });

      await this.client.connect();
      this.connected = true;
    }
  }

  async query(text: string, params?: any[]): Promise<QueryResult> {
    await this.ensureConnected();
    return this.client.query(text, params);
  }

  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}
