import { Prisma } from '../generated/client.js';

/**
 * Transaction-scoped client handed to repositories inside `UnitOfWork.execute`.
 * Equivalent to Prisma's `Omit<PrismaClient, ITXClientDenyList>`; aliasing keeps
 * the repos decoupled from the full root PrismaClient (which also carries
 * `$connect`/`$on`/`$extends`).
 */
export type TxClient = Prisma.TransactionClient;
