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
 * Inline version for tests that don't want async loading.
 * This is a realistic sApp with authorization constraints.
 * NOTE: This is just the app logic - use wrapSAppSchema() to apply it.
 */
export const SIMPLE_SAPP_LOGIC = `
table Items (
    Id text primary key,
    Name text not null,
    Value text,
    CreatedBy text not null,
    constraint AuthorizedWrite check (
        -- Insert: creator must be the context member
        (old.Id is null and new.CreatedBy = context.MemberKey)
        -- Update: only the creator can update
        or (old.Id is not null and old.CreatedBy = context.MemberKey
            and verify(digest(new.Id, new.Name, new.Value), context.Signature, context.MemberKey))
    ),
    constraint AuthorizedDelete check on delete (
        -- Only the creator can delete
        old.CreatedBy = context.MemberKey
        and verify(digest(old.Id), context.Signature, context.MemberKey)
    )
) with context (MemberKey text, Signature text);
`.trim();

/**
 * Even simpler app logic for basic connectivity tests
 */
export const MINIMAL_SAPP_LOGIC = `
table Data (
    Key text primary key,
    Val text
);
`.trim();

/**
 * Wrap sApp logic in declare/apply schema statements
 */
export function wrapSAppSchema(schemaName: string, appLogic: string): string {
  return `declare schema ${schemaName} {\n${appLogic}\n}\n\napply schema ${schemaName};`;
}

