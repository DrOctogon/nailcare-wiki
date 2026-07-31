// Test-only no-op stub for the `server-only` package. The real module throws
// when imported outside a React Server Component bundle; under Vitest we alias
// `server-only` to this file so vault.ts / markdown.ts / semantic-search.ts can
// be imported in a plain Node context.
export {};
