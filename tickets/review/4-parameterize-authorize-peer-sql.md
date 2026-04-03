priority: 4
description: Replace string-interpolated SQL with parameterized queries in cadre-core
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/src/control-database.ts
----

## Summary

Three functions in cadre-core were refactored from string-interpolated SQL to parameterized queries using `db.exec(sql, params)` with `?` placeholders. This eliminates latent SQL injection risk.

## Changes

### `seed-bootstrap.ts` — `authorizePeer()` (line 161)
- 4 parameters: `[authorityPublicKey, signature, peerId, multiaddrStr]`
- Context values (`AuthorityKey`, `Signature`) and row values (`PeerId`, `Multiaddr`) all parameterized

### `control-database.ts` — `insertAuthorityKey()` (line 307)
- 1 parameter: `[key]`
- Context values `null` and `StampId()` remain inline (not user-supplied; `StampId()` is a SQL function call)

### `control-database.ts` — `insertStrand()` (line 343)
- 6 parameters: `[authorityKey, signature, stampId, strandId, type, memberPrivateKey ?? null]`
- All context and row values parameterized; `null` passed directly via parameter array instead of ternary

## Testing

- Build passes
- All 25 tests pass (3 test files)
- The pre-existing websocket-chat failure noted in the implement ticket was not observed

## Review Checklist
- [ ] Verify parameterized values match the SQL placeholder positions in all three queries
- [ ] Confirm no remaining string interpolation in SQL statements
- [ ] Ensure `null` handling is correct (e.g., `memberPrivateKey ?? null` in `insertStrand`)
- [ ] Verify inline `StampId()` in `insertAuthorityKey` is appropriate (it's a SQL function, not a value)
