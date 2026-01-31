import { Injectable, Scope } from '@nestjs/common';
import { Client, QueryResult } from 'pg';
import { AWSXRay } from '../xray';

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

    const segment = AWSXRay.getSegment();

    // If no active segment, just run the query without tracing
    if (!segment) {
      return this.client.query(text, params);
    }

    // Create a subsegment for this database query
    const subsegment = segment.addNewSubsegment('postgres');
    subsegment.addAnnotation('database', process.env.DB_NAME || 'magician_props_store');
    subsegment.addMetadata('sql', { query: this.sanitizeQuery(text) });

    try {
      const result = await this.client.query(text, params);
      subsegment.addMetadata('sql', { rowCount: result.rowCount });
      return result;
    } catch (error) {
      subsegment.addError(error as Error);
      throw error;
    } finally {
      subsegment.close();
    }
  }

  private sanitizeQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim().substring(0, 500);
  }

  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}
