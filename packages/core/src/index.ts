// @narraza/core — pure domain (no AI, DB, HTTP, or Next). Reveal/expression/
// knowledge/disclosure/readiness policies, context packets, deterministic
// validator, and operation layers land here in M1. Auth policy (D21) lands in M0.

export const CORE_PACKAGE = '@narraza/core' as const;

export * as auth from './auth/index.js';
export * as narrative from './narrative/index.js';
export * as foundation from './foundation/index.js';
export * as dependency from './dependency/index.js';
export * as prose from './prose/index.js';
export * as context from './context/index.js';
export * as validation from './validation/index.js';
