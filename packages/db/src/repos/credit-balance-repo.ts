import type { CreditBalancePort, CreditBalanceSnapshot } from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * ONE PostgreSQL statement computing the full balance tuple. All three scalar
 * subqueries execute inside a single MVCC statement snapshot, so under READ
 * COMMITTED a concurrent settlement cannot be half-observed (book decremented
 * while exposure still counted, or vice versa). Task 5 is read-only: no locks,
 * no mutations, no SERIALIZABLE escalation.
 *
 * Book vocabulary (frozen):
 *   + grant / refund / adjustment(direction=credit)
 *   − charge (legacy read compatibility) / reservation_settlement / adjustment(direction=debit)
 *   release is EXCLUDED from book — reserve writes no ledger row; the
 *   reservation lifecycle carries the hold instead.
 *
 * Exposure vocabulary (frozen, PM Amendment #16):
 *   held        = exposure of status 'open'    where funding_model <> 'system_funded' (NULL legacy counts)
 *   reconciling = exposure of status 'closing' where funding_model <> 'system_funded' (NULL legacy counts)
 */
const SUMMARY_SQL = `SELECT
  (SELECT COALESCE(SUM(
     CASE
       WHEN l.direction = 'credit' AND l.entry_type IN ('grant','refund','adjustment') THEN l.amount_micro_idr
       WHEN l.direction = 'debit' AND l.entry_type IN ('charge','reservation_settlement','adjustment') THEN -l.amount_micro_idr
       ELSE 0
     END), 0)
     FROM credit_ledger l
    WHERE l.user_id = $1) AS book_micro_idr,
  (SELECT COALESCE(SUM(r.exposure_micro_idr), 0)
     FROM credit_reservations r
    WHERE r.user_id = $1
      AND r.status = 'open'
      AND (r.funding_model IS NULL OR r.funding_model <> 'system_funded')) AS held_micro_idr,
  (SELECT COALESCE(SUM(r.exposure_micro_idr), 0)
     FROM credit_reservations r
    WHERE r.user_id = $1
      AND r.status = 'closing'
      AND (r.funding_model IS NULL OR r.funding_model <> 'system_funded')) AS reconciling_micro_idr`;

interface RawSnapshotRow {
  book_micro_idr: bigint | number | string;
  held_micro_idr: bigint | number | string;
  reconciling_micro_idr: bigint | number | string;
}

export function createCreditBalanceRepo(tx: TxClient): CreditBalancePort {
  return {
    async getBalanceSnapshot(userId: string): Promise<CreditBalanceSnapshot> {
      const rows = (await tx.$queryRawUnsafe(SUMMARY_SQL, userId)) as RawSnapshotRow[];
      const row = rows[0];
      return {
        bookMicroIdr: BigInt(row?.book_micro_idr ?? 0),
        heldMicroIdr: BigInt(row?.held_micro_idr ?? 0),
        reconcilingMicroIdr: BigInt(row?.reconciling_micro_idr ?? 0),
      };
    },
    
    // Task 6: Serialize user balance via FOR UPDATE lock on users row
    async serializeUserBalance(userId: string): Promise<void> {
      await tx.$queryRawUnsafe(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        userId,
      );
    },
  };
}
