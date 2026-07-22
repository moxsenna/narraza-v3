import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();

async function insertFact(
  client: Parameters<Parameters<typeof schema.test>[1]>[0]['client'],
  id: string,
  projectId: string,
  factKey: string,
  deleted = false,
): Promise<void> {
  await client.query(
    `INSERT INTO facts
       (id,project_id,fact_key,canon_status,visibility,revision,schema_version,payload,deleted_at,created_at,updated_at)
     VALUES ($1,$2,$3,'canonical','private',0,1,'{}',$4,now(),now())`,
    [id, projectId, factKey, deleted ? new Date('2026-07-22T00:00:00Z') : null],
  );
}

schema.test('active fact key unique per tenant and tombstones free key', async ({ client }) => {
  await seedUsersAndProjects(client);
  await insertFact(client, 'fact-a-1', ids.projectA, 'secret');
  await expectSqlState(insertFact(client, 'fact-a-2', ids.projectA, 'secret'), '23505');
  await insertFact(client, 'fact-b-1', ids.projectB, 'secret');

  await client.query(`UPDATE facts SET deleted_at = now() WHERE id = 'fact-a-1'`);
  await insertFact(client, 'fact-a-3', ids.projectA, 'secret');
  await insertFact(client, 'fact-a-old-1', ids.projectA, 'secret', true);
  await insertFact(client, 'fact-a-old-2', ids.projectA, 'secret', true);

  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM facts WHERE project_id=$1 AND fact_key='secret'`,
    [ids.projectA],
  );
  expect(result.rows[0]?.count).toBe('4');
});
