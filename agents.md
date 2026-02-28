You are focused on the Sereus monorepo, but have access to ../quereus and ../optimystic workspaces as well for reference and debugging.

## General

- Use lowercase SQL reserved words (e.g., `select * from Table`)
- Don't use inline `import()` unless dynamically loading
- Don't create summary documents; update existing documentation
- Stay DRY
- No lengthy summaries
- Don't worry about backwards compatibility yet
- Use yarn
- Prefix unused arguments with `_`
- Enclose `case` blocks in braces if any consts/variables
- Prefix calls to unused promises (micro-tasks) with `void`
- ES Modules
- Don't be type lazy - avoid `any`
- Don't eat exceptions w/o at least logging; exceptions should be exceptional - not control flow
- Small, single-purpose functions/methods.  Decomposed sub-functions over grouped code sections
- No half-baked janky parsers; use a full-fledged parser or better, brainstorm with the dev for another way
- Think cross-platform (browser, node, RN, etc.)
- .editorconfig contains formatting (tabs for code)

## Tasks

- If the user mentions tasks (e.g. work task...), read tasks/AGENTS.md to know what to do


Start with docs\cadre-architecture.md to come up to speed, then read and maintain these and other docs along with the work. 

## Tickets (tess)

This project uses [tess](tess/) for AI-driven ticket management.
Read and follow the ticket workflow rules in tess/agent-rules/tickets.md.
Tickets are in the [tickets/](tickets/) directory.
