import type { Pool } from 'pg';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph } from './fixtures.js';

const schema = createSchemaTestSuite();
const HASH = 'a'.repeat(64);

async function seedProjectBPlanningGraph(client: Pool): Promise<void> {
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
     VALUES ($1,$2,'arc-b',0,'Chapter C',0,0,1,'{}',now(),now())`,
    [ids.chapterC, ids.projectB],
  );
  await client.query(
    `INSERT INTO beats
       (id,project_id,chapter_id,ordinal,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,0,0,1,'{}',now(),now())`,
    [ids.beatC, ids.projectB, ids.chapterC],
  );
}

async function insertFact(client: Pool, id: string, projectId: string, status = 'confirmed') {
  return client.query(
    `INSERT INTO facts
       (id,project_id,fact_key,canon_status,visibility,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$1,$3,'private',0,1,'{}',now(),now())`,
    [id, projectId, status],
  );
}

async function insertProse(
  client: Pool,
  id: string,
  projectId: string,
  beatId: string,
  status = 'draft',
) {
  return client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ($1,$2,$3,$4,0,'text',$5,now())`,
    [id, projectId, beatId, status, HASH],
  );
}

schema.test('Fact canon status allows exact lifecycle only', async ({ client }) => {
  await seedPlanningGraph(client);
  for (const status of ['confirmed', 'deprecated', 'contradicted']) {
    await insertFact(client, `fact-${status}`, ids.projectA, status);
  }
  for (const status of ['proposed', 'canonical', 'retracted', 'invalid']) {
    await expectSqlState(insertFact(client, `fact-${status}`, ids.projectA, status), '23514');
  }
});

schema.test('ProseVersion status allows exact lifecycle and never accepted', async ({ client }) => {
  await seedPlanningGraph(client);
  for (const status of ['draft', 'validated', 'rejected', 'superseded']) {
    await insertProse(client, `prose-${status}`, ids.projectA, ids.beatA, status);
  }
  for (const status of ['candidate', 'accepted', 'invalid']) {
    await expectSqlState(
      insertProse(client, `prose-${status}`, ids.projectA, ids.beatA, status),
      '23514',
    );
  }
});

schema.test('active working draft is unique per project user and beat', async ({ client }) => {
  await seedPlanningGraph(client);
  const insertDraft = (id: string, deleted: boolean) =>
    client.query(
      `INSERT INTO prose_working_drafts
         (id,project_id,beat_id,user_id,revision,content,content_hash,deleted_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,0,'text',$5,$6,now(),now())`,
      [id, ids.projectA, ids.beatA, ids.userA, HASH, deleted ? new Date() : null],
    );

  await insertDraft('working-a', false);
  await expectSqlState(insertDraft('working-b', false), '23505');
  await client.query(`UPDATE prose_working_drafts SET deleted_at=now() WHERE id='working-a'`);
  await insertDraft('working-c', false);
  await insertDraft('working-old', true);
});

schema.test(
  'knowledge and reveal composite FKs reject cross-tenant linkage',
  async ({ client }) => {
    await seedPlanningGraph(client);
    await seedProjectBPlanningGraph(client);
    await insertFact(client, 'fact-a', ids.projectA);
    await insertFact(client, 'fact-b', ids.projectB);

    await expectSqlState(
      client.query(
        `INSERT INTO fact_disclosures
         (id,project_id,fact_id,event_type,effective_sequence,created_at)
       VALUES ('cross-tenant-disclosure',$1,'fact-a','disclose',0,now())`,
        [ids.projectB],
      ),
      '23503',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO reveals
         (id,project_id,fact_id,chapter_id,target_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('cross-tenant-reveal',$1,'fact-b',$2,0,0,1,'{}',now(),now())`,
        [ids.projectB, ids.chapterA],
      ),
      '23503',
    );
  },
);

schema.test(
  'knowledge and prose lifecycle checks reject illegal values with 23514',
  async ({ client }) => {
    await seedPlanningGraph(client);
    await insertFact(client, 'fact-a', ids.projectA);
    await insertProse(client, 'prose-a', ids.projectA, ids.beatA, 'validated');

    await expectSqlState(
      client.query(
        `INSERT INTO fact_disclosures
         (id,project_id,fact_id,event_type,effective_sequence,created_at)
       VALUES ('bad-event',$1,'fact-a','invalid',0,now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO reader_fact_states
         (id,project_id,fact_id,as_of_sequence,state,source_disclosure_id,created_at,updated_at)
       VALUES ('bad-reader-state',$1,'fact-a',0,'invalid','missing',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO prose_evidence
         (id,project_id,prose_version_id,start_utf16,end_utf16,content_hash,evidence_type,schema_version,payload,created_at)
       VALUES ('bad-evidence-type',$1,'prose-a',0,1,$2,'invalid',1,'{}',now())`,
        [ids.projectA, HASH],
      ),
      '23514',
    );
  },
);

schema.test('disclosure and retraction fields remain coherent', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);

  await expectSqlState(
    client.query(
      `INSERT INTO fact_disclosures
         (id,project_id,fact_id,event_type,effective_sequence,retracts_disclosure_id,created_at)
       VALUES ('disclose-with-target',$1,'fact-a','disclose',0,'missing',now())`,
      [ids.projectA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO fact_disclosures
         (id,project_id,fact_id,event_type,effective_sequence,created_at)
       VALUES ('retract-without-target',$1,'fact-a','retract',1,now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test('UTF-16 evidence offsets reject negative and reversed ranges', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertProse(client, 'prose-a', ids.projectA, ids.beatA, 'validated');
  const insertEvidence = (id: string, start: number, end: number) =>
    client.query(
      `INSERT INTO prose_evidence
         (id,project_id,prose_version_id,start_utf16,end_utf16,content_hash,evidence_type,schema_version,payload,created_at)
       VALUES ($1,$2,'prose-a',$3,$4,$5,'fact',1,'{}',now())`,
      [id, ids.projectA, start, end, HASH],
    );

  await insertEvidence('valid-utf16', 1, 3);
  await expectSqlState(insertEvidence('negative-utf16', -1, 1), '23514');
  await expectSqlState(insertEvidence('reversed-utf16', 3, 2), '23514');
});

schema.test('hash payload and revision checks reject malformed values', async ({ client }) => {
  await seedPlanningGraph(client);

  await expectSqlState(
    client.query(
      `INSERT INTO prose_versions
         (id,project_id,beat_id,status,revision,content,content_hash,created_at)
       VALUES ('bad-hash',$1,$2,'validated',0,'text','ABC',now())`,
      [ids.projectA, ids.beatA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO prose_working_drafts
         (id,project_id,beat_id,user_id,revision,content,content_hash,created_at,updated_at)
       VALUES ('bad-draft-revision',$1,$2,$3,-1,'text',$4,now(),now())`,
      [ids.projectA, ids.beatA, ids.userA, HASH],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO facts
         (id,project_id,fact_key,canon_status,visibility,revision,schema_version,payload,created_at,updated_at)
       VALUES ('bad-payload',$1,'bad-payload','confirmed','private',0,1,'[]',now(),now())`,
      [ids.projectA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO reveals
         (id,project_id,fact_id,chapter_id,target_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('bad-revision',$1,'missing',$2,0,-1,1,'{}',now(),now())`,
      [ids.projectA, ids.chapterA],
    ),
    '23514',
  );
});

schema.test('retraction target must belong to same fact', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);
  await insertFact(client, 'fact-b', ids.projectA);
  await client.query(
    `INSERT INTO fact_disclosures
       (id,project_id,fact_id,event_type,effective_sequence,created_at)
     VALUES ('disclosure-a',$1,'fact-a','disclose',0,now())`,
    [ids.projectA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO fact_disclosures
         (id,project_id,fact_id,event_type,effective_sequence,retracts_disclosure_id,created_at)
       VALUES ('wrong-fact-retraction',$1,'fact-b','retract',1,'disclosure-a',now())`,
      [ids.projectA],
    ),
    '23503',
  );
});

schema.test('reader fact source disclosure must belong to same fact', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);
  await insertFact(client, 'fact-b', ids.projectA);
  await client.query(
    `INSERT INTO fact_disclosures
       (id,project_id,fact_id,event_type,effective_sequence,created_at)
     VALUES ('disclosure-a',$1,'fact-a','disclose',0,now())`,
    [ids.projectA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO reader_fact_states
         (id,project_id,fact_id,as_of_sequence,state,source_disclosure_id,created_at,updated_at)
       VALUES ('wrong-fact-source',$1,'fact-b',0,'known','disclosure-a',now(),now())`,
      [ids.projectA],
    ),
    '23503',
  );
});

schema.test('reveal optional beat must belong to reveal chapter', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);

  await expectSqlState(
    client.query(
      `INSERT INTO reveals
         (id,project_id,fact_id,chapter_id,beat_id,target_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('wrong-chapter-beat',$1,'fact-a',$2,$3,0,0,1,'{}',now(),now())`,
      [ids.projectA, ids.chapterA, ids.beatB],
    ),
    '23503',
  );
});

schema.test('breadcrumb optional beat must belong to breadcrumb chapter', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);
  await client.query(
    `INSERT INTO reveals
       (id,project_id,fact_id,chapter_id,target_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ('reveal-a',$1,'fact-a',$2,0,0,1,'{}',now(),now())`,
    [ids.projectA, ids.chapterA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO reveal_breadcrumbs
         (id,project_id,reveal_id,chapter_id,beat_id,sequence,schema_version,payload,created_at,updated_at)
       VALUES ('wrong-chapter-beat',$1,'reveal-a',$2,$3,0,1,'{}',now(),now())`,
      [ids.projectA, ids.chapterA, ids.beatB],
    ),
    '23503',
  );
});

schema.test('disclosure evidence must belong to selected prose version', async ({ client }) => {
  await seedPlanningGraph(client);
  await insertFact(client, 'fact-a', ids.projectA);
  await insertProse(client, 'prose-a', ids.projectA, ids.beatA, 'validated');
  await insertProse(client, 'prose-b', ids.projectA, ids.beatB, 'validated');
  await client.query(
    `INSERT INTO prose_evidence
       (id,project_id,prose_version_id,start_utf16,end_utf16,content_hash,evidence_type,schema_version,payload,created_at)
     VALUES ('evidence-a',$1,'prose-a',0,1,$2,'disclosure',1,'{}',now())`,
    [ids.projectA, HASH],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO fact_disclosures
         (id,project_id,fact_id,prose_version_id,event_type,effective_sequence,evidence_id,created_at)
       VALUES ('wrong-prose-evidence',$1,'fact-a','prose-b','disclose',0,'evidence-a',now())`,
      [ids.projectA],
    ),
    '23503',
  );
});

schema.test(
  'character state prose pointer rejects nonexistent and cross-tenant prose',
  async ({ client }) => {
    await seedPlanningGraph(client);
    await seedProjectBPlanningGraph(client);
    await client.query(
      `INSERT INTO characters
       (id,project_id,display_name,role,revision,schema_version,payload,created_at,updated_at)
     VALUES ('character-a',$1,'A','lead',0,1,'{}',now(),now()),
            ('character-b',$2,'B','lead',0,1,'{}',now(),now())`,
      [ids.projectA, ids.projectB],
    );
    await insertProse(client, 'prose-a', ids.projectA, ids.beatA, 'validated');

    await expectSqlState(
      client.query(
        `INSERT INTO character_states
         (id,project_id,character_id,effective_sequence,prose_version_id,schema_version,payload,created_at)
       VALUES ('missing-prose',$1,'character-a',0,'does-not-exist',1,'{}',now())`,
        [ids.projectA],
      ),
      '23503',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO character_states
         (id,project_id,character_id,effective_sequence,prose_version_id,schema_version,payload,created_at)
       VALUES ('cross-tenant-prose',$1,'character-b',0,'prose-a',1,'{}',now())`,
        [ids.projectB],
      ),
      '23503',
    );
  },
);
