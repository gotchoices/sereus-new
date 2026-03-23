priority: 4
description: Replace string-interpolated SQL with parameterized queries in cadre-core
dependencies: @quereus/quereus parameterized query API (db.exec with SqlParameters)
files:
  - packages/cadre-core/src/seed-bootstrap.ts
  - packages/cadre-core/src/control-database.ts
----

## Context

Three functions in cadre-core built SQL via template literal interpolation instead of using Quereus's parameterized query support (`db.exec(sql, params)`). While inputs were controlled, this violated best practice and created latent SQL injection risk.

## Changes Made

### `seed-bootstrap.ts` — `authorizePeer()`
Replaced string interpolation for PeerId, Multiaddr, AuthorityKey, and Signature with `?` placeholders, passing values as an array to `db.exec()`.

### `control-database.ts` — `insertAuthorityKey()`
Replaced interpolated key value with `?` placeholder. The `with context` values (null literals and `StampId()` function call) remain inline as they are not user-supplied.

### `control-database.ts` — `insertStrand()`
Replaced all 6 interpolated values (3 in `with context`, 3 in `values`) with `?` placeholders. Removed the intermediate `memberKeyValue` ternary — `null` is passed directly via the parameter array.

## TODO
- [ ] Refactor `authorizePeer()` to use parameterized INSERT with `?` placeholders
- [ ] Refactor `insertAuthorityKey()` to use parameterized INSERT
- [ ] Refactor `insertStrand()` to use parameterized INSERT
- [ ] Build passes
- [ ] Existing tests pass (1 pre-existing unrelated failure in websocket-chat schema signature)
