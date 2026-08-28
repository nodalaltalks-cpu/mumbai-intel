// Stub for the "server-only" marker package (see node_modules/server-only) —
// its real implementation unconditionally throws when required outside a
// "react-server" bundler condition, which plain Node/Vitest never declares.
// Aliased in here via vitest.config.ts's resolve.alias so any lib file that
// does `import "server-only"` (a real, existing convention across this
// codebase, not something added for this bridge) can still be unit tested.
export {};
