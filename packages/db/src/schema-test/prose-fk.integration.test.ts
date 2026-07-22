import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph } from './fixtures.js';

const schema = createSchemaTestSuite();

schema.test('accepted prose belongs to same beat and project', async ({ client }) => {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ('prose-a',$1,$2,'validated',0,'text',$3,now())`,
    [ids.projectA, ids.beatA, 'a'.repeat(64)],
  );

  await client.query(`UPDATE beats SET accepted_prose_version_id='prose-a' WHERE id=$1`, [
    ids.beatA,
  ]);
  await expectSqlState(
    client.query(`UPDATE beats SET accepted_prose_version_id='prose-a' WHERE id=$1`, [ids.beatB]),
    '23503',
  );

  await client.query(
    `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ('roadmap-b',$1,'Roadmap B',0,1,'{}',now(),now())`,
    [ids.projectB],
  );
  await client.query(
    `INSERT INTO arcs (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ('arc-b',$1,'roadmap-b',0,'Arc B',0,1,'{}',now(),now())`,
    [ids.projectB],
  );
  await client.query(
    `INSERT INTO chapters
       (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'arc-b',0,'C',0,0,1,'{}',now(),now())`,
    [ids.chapterC, ids.projectB],
  );
  await client.query(
    `INSERT INTO beats
       (id,project_id,chapter_id,ordinal,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,0,0,1,'{}',now(),now())`,
    [ids.beatC, ids.projectB, ids.chapterC],
  );
  await expectSqlState(
    client.query(`UPDATE beats SET accepted_prose_version_id='prose-a' WHERE id=$1`, [ids.beatC]),
    '23503',
  );
});

schema.test('accepted prose delete uses NO ACTION until pointer is cleared', async ({ client }) => {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ('prose-a',$1,$2,'validated',0,'text',$3,now())`,
    [ids.projectA, ids.beatA, 'b'.repeat(64)],
  );
  await client.query(`UPDATE beats SET accepted_prose_version_id='prose-a' WHERE id=$1`, [
    ids.beatA,
  ]);
  await expectSqlState(client.query(`DELETE FROM prose_versions WHERE id='prose-a'`), '23503');
  await client.query(`UPDATE beats SET accepted_prose_version_id=NULL WHERE id=$1`, [ids.beatA]);
  await client.query(`DELETE FROM prose_versions WHERE id='prose-a'`);
});
