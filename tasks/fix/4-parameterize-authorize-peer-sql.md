priority: 4
description: Replace string-interpolated SQL in authorizePeer() with parameterized queries
dependencies: packages/cadre-core/src/seed-bootstrap.ts, @quereus/quereus parameterized query API
----
The `authorizePeer()` function in `seed-bootstrap.ts` builds an INSERT statement by string interpolation rather than parameterized queries. While inputs are currently controlled (peer IDs and multiaddrs), this violates best practice and creates a latent SQL injection risk.

Refactor to use Quereus parameterized queries with `?` placeholders, consistent with the pattern used in `chat-operations.ts`.

## TODO
- [ ] Refactor `authorizePeer()` to use parameterized INSERT with `?` placeholders
- [ ] Verify existing tests still pass
- [ ] Check for other string-interpolated SQL in cadre-core and fix any found
