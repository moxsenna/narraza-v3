import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();

schema.test('planning composite FK rejects cross-tenant parent linkage', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'Roadmap A',0,1,'{}',now(),now())`,
    [ids.roadmapA, ids.projectA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO arcs
         (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
       VALUES ('cross-tenant-arc',$1,$2,0,'Invalid',0,1,'{}',now(),now())`,
      [ids.projectB, ids.roadmapA],
    ),
    '23503',
  );
});

schema.test(
  'planning CHECK constraints reject invalid lifecycle and ordering',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    await expectSqlState(
      client.query(
        `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-revision',$1,'Invalid',-1,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO intake_sessions
         (id,project_id,status,signal_count,schema_version,payload,created_at,updated_at)
       VALUES ('invalid-status',$1,'not-a-status',0,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO intake_sessions
         (id,project_id,status,signal_count,schema_version,payload,created_at,updated_at)
       VALUES ('invalid-payload',$1,'active',0,1,'[]',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
  },
);

schema.test('planning ordinal CHECK constraints reject negative values', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'Roadmap A',0,1,'{}',now(),now())`,
    [ids.roadmapA, ids.projectA],
  );
  await client.query(
    `INSERT INTO arcs
       (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'Arc A',0,1,'{}',now(),now())`,
    [ids.arcA, ids.projectA, ids.roadmapA],
  );
  await client.query(
    `INSERT INTO chapters
       (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'Chapter A',0,0,1,'{}',now(),now())`,
    [ids.chapterA, ids.projectA, ids.arcA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO arcs
         (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-ordinal-arc',$1,$2,-1,'Invalid',0,1,'{}',now(),now())`,
      [ids.projectA, ids.roadmapA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO chapters
         (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-ordinal-chapter',$1,$2,-1,'Invalid',1,0,1,'{}',now(),now())`,
      [ids.projectA, ids.arcA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO beats
         (id,project_id,chapter_id,ordinal,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-ordinal-beat',$1,$2,-1,1,0,1,'{}',now(),now())`,
      [ids.projectA, ids.chapterA],
    ),
    '23514',
  );
});

schema.test('planning sequence CHECK constraints reject negative values', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO intake_sessions
       (id,project_id,status,signal_count,schema_version,payload,created_at,updated_at)
     VALUES ('intake-a',$1,'active',0,1,'{}',now(),now())`,
    [ids.projectA],
  );
  await client.query(
    `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'Roadmap A',0,1,'{}',now(),now())`,
    [ids.roadmapA, ids.projectA],
  );
  await client.query(
    `INSERT INTO arcs
       (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'Arc A',0,1,'{}',now(),now())`,
    [ids.arcA, ids.projectA, ids.roadmapA],
  );
  await client.query(
    `INSERT INTO chapters
       (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'Chapter A',0,0,1,'{}',now(),now())`,
    [ids.chapterA, ids.projectA, ids.arcA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO intake_messages
         (id,project_id,intake_session_id,role,sequence,content,created_at)
       VALUES ('negative-message-sequence',$1,'intake-a','user',-1,'Invalid',now())`,
      [ids.projectA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO chapters
         (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-chapter-sequence',$1,$2,1,'Invalid',-1,0,1,'{}',now(),now())`,
      [ids.projectA, ids.arcA],
    ),
    '23514',
  );
  await expectSqlState(
    client.query(
      `INSERT INTO beats
         (id,project_id,chapter_id,ordinal,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
       VALUES ('negative-beat-sequence',$1,$2,1,-1,0,1,'{}',now(),now())`,
      [ids.projectA, ids.chapterA],
    ),
    '23514',
  );
});
