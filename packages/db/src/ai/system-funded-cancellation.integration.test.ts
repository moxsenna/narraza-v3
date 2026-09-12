import { createJobService, createSystemFundedIntakeService } from '@narraza/application';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

schema.test(
  'queued system-funded cancellation reconciles S=0,L=R,E=0 with zero ledger',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('cancel-snapshot',$1,'extraction','review_safe',$2,$3,1,'{}',now())`,
      [ids.projectA, 'a'.repeat(64), 'b'.repeat(64)],
    );
    await client.query(
      `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('cancel-bundle',$1,'cancel-snapshot',$2,$3,now()+interval '1 day',1,'{}',now())`,
      [ids.projectA, 'a'.repeat(64), 'c'.repeat(64)],
    );
    await client.query(
      `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ('cancel-plan',$1,'cancel-bundle','chat_intake_reply',$2,1000,1,$3::jsonb,now())`,
      [
        ids.projectA,
        'd'.repeat(64),
        JSON.stringify({ schemaVersion: 1, workflowKind: 'chat_intake_reply', stages: [] }),
      ],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    try {
      const intake = await createSystemFundedIntakeService({ unitOfWork }).create({
        requestId: 'cancel-request',
        userId: ids.userA,
        projectId: ids.projectA,
        bundleId: 'cancel-bundle',
        workflowPlanId: 'cancel-plan',
        workflowPlanHash: 'd'.repeat(64),
        dependencyHash: 'a'.repeat(64),
        budgetMicroIdr: 1000n,
        payload: {},
      });
      expect(intake.kind).toBe('accepted');
      if (intake.kind !== 'accepted') throw new Error('expected accepted intake');

      expect(
        await createJobService(unitOfWork).cancel({
          projectId: ids.projectA,
          jobId: intake.job.id,
        }),
      ).toMatchObject({ kind: 'cancelled' });
      const reservation = await client.query<{
        status: string;
        settled_micro_idr: string;
        released_micro_idr: string;
        exposure_micro_idr: string;
      }>(
        `SELECT status,settled_micro_idr,released_micro_idr,exposure_micro_idr
         FROM credit_reservations WHERE id=$1`,
        [intake.reservationId],
      );
      expect(reservation.rows[0]).toEqual({
        status: 'cancelled',
        settled_micro_idr: '0',
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
      });
      expect(await client.query('SELECT 1 FROM credit_ledger')).toHaveProperty('rowCount', 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);
