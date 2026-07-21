import type { AuthUserRecord, UserStore } from '@narraza/application';
import type { PrismaClient } from '../client.js';

const SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  status: true,
  emailVerifiedAt: true,
} as const;

export function createUserStore(prisma: PrismaClient): UserStore {
  return {
    async findByEmail(email) {
      return prisma.user.findUnique({
        where: { email },
        select: SELECT,
      }) as Promise<AuthUserRecord | null>;
    },
    async findById(id) {
      return prisma.user.findUnique({
        where: { id },
        select: SELECT,
      }) as Promise<AuthUserRecord | null>;
    },
    async createPendingUser({ email, passwordHash }) {
      try {
        return (await prisma.user.create({
          data: { email, passwordHash },
          select: SELECT,
        })) as AuthUserRecord;
      } catch (e: unknown) {
        // Unique violation on email → treat as "already exists" (enumeration-safe).
        if (isUniqueViolation(e)) return null;
        throw e;
      }
    },
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002'
  );
}
