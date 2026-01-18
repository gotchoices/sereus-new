/**
 * Test fixtures for integration tests
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', '..', 'fixtures');

/**
 * Load the simple sApp schema
 */
export async function loadSimpleSApp(): Promise<string> {
  return readFile(resolve(fixturesDir, 'simple-sapp.qsql'), 'utf-8');
}

/**
 * Inline version for tests that don't want async loading
 */
export const SIMPLE_SAPP_SCHEMA = `
declare schema SimpleApp {
    table Items (
        Id text primary key,
        Name text not null,
        Value text,
        CreatedAt datetime default current_timestamp,
        CreatedBy text
    );
    
    table AuditLog (
        Id integer primary key,
        ItemId text not null,
        Action text not null,
        ChangedBy text,
        ChangedAt datetime default current_timestamp
    );
}

apply schema SimpleApp;
`.trim();

/**
 * Even simpler schema for basic connectivity tests
 */
export const MINIMAL_SAPP_SCHEMA = `
declare schema MinimalApp {
    table Data (
        Key text primary key,
        Val text
    );
}

apply schema MinimalApp;
`.trim();

