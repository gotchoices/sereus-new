priority: 4
description: Replace string-interpolated SQL with parameterized queries in cadre-core
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/src/control-database.ts
----

## What was done

Three functions in cadre-core were refactored from string-interpolated SQL to parameterized queries using `db.exec(sql, params)` with `?` placeholders, eliminating latent SQL injection risk:

- **`authorizePeer()`** in `seed-bootstrap.ts:161` — 4 parameters (AuthorityKey, Signature, PeerId, Multiaddr)
- **`insertAuthorityKey()`** in `control-database.ts:307` — 1 parameter (Key); `null` context and `StampId()` remain inline as SQL literals/functions
- **`insertStrand()`** in `control-database.ts:343` — 6 parameters (AuthorityKey, Signature, StampId, Id, Type, MemberPrivateKey)

## Testing

- Build passes
- All 25 tests pass across 3 test files
- No remaining `${...}` string interpolation in any SQL statements

## Review notes

- Placeholder positions verified against parameter arrays in all three queries
- `memberPrivateKey ?? null` correctly handles optional parameter
- Inline `StampId()` in bootstrap path is appropriate (SQL function, not user input)
- No other SQL injection vectors found in cadre-core
