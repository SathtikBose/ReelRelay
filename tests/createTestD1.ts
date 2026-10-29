import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Creates an in-memory SQLite database wrapped in the Cloudflare D1 interface
 * for ultra-fast, high-fidelity native unit and integration testing.
 */
export function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");

  // Read and apply the real migrations/0001_init.sql
  const migrationPath = path.resolve(process.cwd(), "migrations/0001_init.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  sqlite.exec(migrationSql);

  const d1Mock = {
    prepare(query: string) {
      let boundArgs: any[] = [];

      return {
        bind(...args: any[]) {
          boundArgs = args.map((a) => (a === undefined ? null : a));
          return this;
        },

        async first<T = unknown>(colName?: string): Promise<T | null> {
          const stmt = sqlite.prepare(query);
          const row = stmt.get(...boundArgs) as Record<string, unknown> | undefined;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },

        async all<T = unknown>() {
          const stmt = sqlite.prepare(query);
          const results = stmt.all(...boundArgs) as T[];
          return {
            results,
            success: true,
            meta: { changes: 0 },
          };
        },

        async run() {
          const stmt = sqlite.prepare(query);
          const info = stmt.run(...boundArgs);
          return {
            success: true,
            meta: {
              changes: Number(info.changes),
              last_row_id: Number(info.lastInsertRowid),
            },
          };
        },
      };
    },
  };

  return d1Mock as unknown as D1Database;
}
