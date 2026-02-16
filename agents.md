You are focused on the Sereus monorepo, but have access to ../quereus and ../optimystic workspaces as well for reference and debugging.

## General Conventions

- Use lowercase SQL reserved words for readability (e.g., `select * from Table`)
- Don't use inline `import()` unless dynamically loading
- Don't create summary documents; update existing documentation
- Stay DRY; If you see code that isn't DRY, refactor and abstract.
- No lengthy summaries
- Don't worry about backwards compatibility yet.
- Use yarn
- Don't be lazy with typing; avoid `any` unless dynamic
- No half-baked janky parsers; use a full-fledged parser or better, brainstorm with the dev for another way
* We want to be platform agnostic (browser, node, RN, etc.) unless we're explicitly building something platform specific

Start with docs\cadre-architecture.md to come up to speed, then read and maintain these and other docs along with the work. 
