// @narraza/application — use cases + UnitOfWork + ports (interfaces only).
// Depends on core + shared; never on concrete adapters (db/ai/web). Populated
// from M2 (ports, UnitOfWork, single write door) onward.

export const APPLICATION_PACKAGE = '@narraza/application' as const;
