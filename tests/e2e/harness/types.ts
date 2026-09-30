/**
 * Interface Contracts from PROJECT.md
 */

export interface DbRequest {
  id: string;
  action: 'exec' | 'query' | 'transaction' | 'export' | 'import' | 'backup' | 'restore';
  sql?: string;
  params?: any[];
  statements?: { sql: string; params?: any[] }[];
  binaryData?: Uint8Array;
}

export interface DbResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface IDbBridge {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  exec(sql: string, params?: any[]): Promise<{ rowsAffected: number; lastInsertRowid: number }>;
  transaction(statements: { sql: string; params?: any[] }[]): Promise<void>;
  exportDb(): Promise<Uint8Array>;
  importDb(data: Uint8Array): Promise<void>;
  createBackup(): Promise<string>;
  getStorageStats(): Promise<{ isPersisted: boolean; usageBytes: number; quotaBytes: number }>;
}
