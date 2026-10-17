import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

describe('Environment & Native Binding Verification', () => {
  it('loads better-sqlite3 native C++ addon and enables foreign keys', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON;');
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);
    db.close();
  });
});
