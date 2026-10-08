// 시험용 D1 흉내: Node 내장 SQLite 위에 D1 의 prepare/bind/first/all/run/batch 만 얹는다
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private st() {
    return this.db.prepare(this.sql);
  }
  async first<T>(): Promise<T | null> {
    return (this.st().get(...(this.args as any[])) as T) ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.st().all(...(this.args as any[])) as T[] };
  }
  async run() {
    const r = this.st().run(...(this.args as any[]));
    return { meta: { changes: Number(r.changes) } };
  }
  runSync() {
    return this.st().run(...(this.args as any[]));
  }
}

export function makeD1(): any {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        for (const s of stmts) s.runSync();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return [];
    },
  };
}
