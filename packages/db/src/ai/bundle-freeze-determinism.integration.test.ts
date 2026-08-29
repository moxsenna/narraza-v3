import { createContextBundleFreezeService, type ContextPacketLike } from '@narraza/application';
import { dependency } from '@narraza/core';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

/**
 * M4 Block A `bundle-freeze-determinism` — real PostgreSQL.
 *
 * The freeze layer must be a pure function of semantic input: the same input
 * always collapses onto ONE bundle row regardless of manifest order or packet
 * key order, while any material change produces a different bundle. Bundles
 * and snapshots are append-only and never rewritten.
 */

const schema = createSchemaTestSuite();
const { buildDependencyManifest, dependencyManifestHash } = dependency;

function manifestHash(entries: Parameters<typeof buildDependencyManifest>[0]): string {
  return dependencyManifestHash(buildDependencyManifest(entries));
}

function packet(
  kind: string,
  projectId: string,
  dependencyHash: string,
  payload: Record<string, unknown>,
): ContextPacketLike {
  return {
    kind,
    dataClass: kind === 'writer' ? 'writer_safe' : 'author_private',
    metadata: { projectId, dependencyHash, schemaVersion: 1 },
    ...payload,
  };
}

function beatPackets(projectId: string, dependencyHash: string): ContextPacketLike[] {
  return [
    packet('writer', projectId, dependencyHash, {
      beatContract: { chapterNumber: 3, sequence: 9 },
      establishedFacts: [{ factId: 'fact-1', statement: 'Kota pelabuhan dibangun 1821' }],
    }),
    packet('validator', projectId, dependencyHash, {
      restrictedGuardSets: [{ guardId: 'guard-1' }],
    }),
  ];
}

const BASE_ENTRIES = [
  { entityType: 'chapter', entityId: 'ch-3', revision: 4, deleted: false },
  { entityType: 'character', entityId: 'char-1', revision: 2, deleted: false },
];

schema.test('bundle-freeze-determinism', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);
  const service = createContextBundleFreezeService({ unitOfWork });
  const dependencyHash = manifestHash(BASE_ENTRIES);

  try {
    // First freeze wins; identical semantic input replays the SAME bundle even
    // under a different caller-allocated bundle id.
    const first = await service.freezeBundle({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'bundle-1',
      dependencyEntries: BASE_ENTRIES,
      packets: beatPackets(ids.projectA, dependencyHash),
    });
    expect(first.kind).toBe('frozen');
    if (first.kind !== 'frozen') throw new Error('unreachable');
    expect(first.bundle.bundleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bundle.dependencyHash).toBe(dependencyHash);
    expect(first.bundle.snapshots.map((row) => row.packetKind).sort()).toEqual([
      'validator',
      'writer',
    ]);

    const replay = await service.freezeBundle({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'bundle-1-again',
      dependencyEntries: BASE_ENTRIES,
      packets: beatPackets(ids.projectA, dependencyHash),
    });
    expect(replay).toEqual({ kind: 'replayed', bundle: first.bundle });

    // Manifest entry order cannot change the hash (core sorts deterministically).
    const reordered = await service.freezeBundle({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'bundle-reorder',
      dependencyEntries: [...BASE_ENTRIES].reverse(),
      packets: beatPackets(ids.projectA, dependencyHash),
    });
    expect(reordered).toEqual({ kind: 'replayed', bundle: first.bundle });

    // Packet key order cannot change the content hash (canonical JSON).
    const keyReorderedPackets = [
      {
        metadata: { schemaVersion: 1, dependencyHash, projectId: ids.projectA },
        establishedFacts: [{ statement: 'Kota pelabuhan dibangun 1821', factId: 'fact-1' }],
        beatContract: { sequence: 9, chapterNumber: 3 },
        dataClass: 'writer_safe',
        kind: 'writer',
      },
      packet('validator', ids.projectA, dependencyHash, {
        restrictedGuardSets: [{ guardId: 'guard-1' }],
      }),
    ] as ContextPacketLike[];
    const keyReordered = await service.freezeBundle({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'bundle-keyorder',
      dependencyEntries: BASE_ENTRIES,
      packets: keyReorderedPackets,
    });
    expect(keyReordered).toEqual({ kind: 'replayed', bundle: first.bundle });

    // Exactly one bundle row exists for the semantic input.
    const bundleCount = (
      await client.query(
        `SELECT count(*)::int AS count FROM generation_context_bundles WHERE project_id = $1`,
        [ids.projectA],
      )
    ).rows[0];
    expect(bundleCount.count).toBe(1);

    // A material dependency change produces a DIFFERENT bundle; the old one is
    // never rewritten.
    const rowsBefore = await client.query(
      `SELECT * FROM generation_context_bundles WHERE project_id = $1 ORDER BY id`,
      [ids.projectA],
    );
    const changedEntries = [
      { entityType: 'chapter', entityId: 'ch-3', revision: 5, deleted: false },
      { entityType: 'character', entityId: 'char-1', revision: 2, deleted: false },
    ];
    const changedHash = manifestHash(changedEntries);
    const changed = await service.freezeBundle({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'bundle-2',
      dependencyEntries: changedEntries,
      packets: beatPackets(ids.projectA, changedHash),
    });
    expect(changed.kind).toBe('frozen');
    if (changed.kind !== 'frozen') throw new Error('unreachable');
    expect(changed.bundle.dependencyHash).not.toBe(dependencyHash);
    expect(changed.bundle.bundleHash).not.toBe(first.bundle.bundleHash);
    const rowsAfter = await client.query(
      `SELECT * FROM generation_context_bundles WHERE project_id = $1 ORDER BY id`,
      [ids.projectA],
    );
    expect(rowsAfter.rows).toHaveLength(2);
    expect(rowsAfter.rows[0]).toEqual(rowsBefore.rows[0]);

    // Snapshots persisted server-restricted packets as `restricted`; the
    // writer snapshot stays `writer_safe`; retention expiry is PG-stamped ~24h.
    const snapshotRows = (
      await client.query(
        `SELECT packet_kind, data_class, content_hash
           FROM context_snapshots WHERE project_id = $1 ORDER BY packet_kind`,
        [ids.projectA],
      )
    ).rows;
    expect(snapshotRows).toHaveLength(4);
    expect(snapshotRows[0]).toMatchObject({ packet_kind: 'validator', data_class: 'restricted' });
    expect(snapshotRows[2]).toMatchObject({ packet_kind: 'writer', data_class: 'writer_safe' });
    // Retention expiry lives on the bundle: PG-stamped ~24h, not yet consumed.
    const bundleRows = (
      await client.query(
        `SELECT expires_at - created_at AS ttl, consumed_at
           FROM generation_context_bundles WHERE project_id = $1`,
        [ids.projectA],
      )
    ).rows;
    for (const row of bundleRows) {
      // node-pg parses a PostgreSQL interval as { days, hours, ... }.
      expect(row.ttl).toMatchObject({ days: 1 });
      expect(row.consumed_at).toBeNull();
    }
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('bundle-freeze-policy-fails-closed', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);
  const service = createContextBundleFreezeService({ unitOfWork });
  const dependencyHash = manifestHash(BASE_ENTRIES);

  try {
    // Unknown workflow kind.
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'mystery_kind',
        bundleId: 'bundle-x1',
        dependencyEntries: BASE_ENTRIES,
        packets: beatPackets(ids.projectA, dependencyHash),
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'unknown_workflow_kind' });

    // Missing required packet.
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'beat_write_judge',
        bundleId: 'bundle-x2',
        dependencyEntries: BASE_ENTRIES,
        packets: [packet('writer', ids.projectA, dependencyHash, {})],
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'missing_required_packet' });

    // Unexpected extra packet.
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'beat_write_judge',
        bundleId: 'bundle-x3',
        dependencyEntries: BASE_ENTRIES,
        packets: [
          ...beatPackets(ids.projectA, dependencyHash),
          packet('planner', ids.projectA, dependencyHash, {}),
        ],
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'unexpected_packet' });

    // Packet built against another project is rejected (cross-project binding).
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'beat_write_judge',
        bundleId: 'bundle-x4',
        dependencyEntries: BASE_ENTRIES,
        packets: beatPackets(ids.projectB, dependencyHash),
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'packet_project_mismatch' });

    // Packet built against a different dependency manifest is rejected.
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'beat_write_judge',
        bundleId: 'bundle-x5',
        dependencyEntries: BASE_ENTRIES,
        packets: beatPackets(ids.projectA, 'f'.repeat(64)),
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'packet_dependency_mismatch' });

    // Duplicate packet kind.
    await expect(
      service.freezeBundle({
        projectId: ids.projectA,
        workflowKind: 'beat_write_judge',
        bundleId: 'bundle-x6',
        dependencyEntries: BASE_ENTRIES,
        packets: [
          packet('writer', ids.projectA, dependencyHash, {}),
          packet('writer', ids.projectA, dependencyHash, {}),
        ],
      }),
    ).resolves.toEqual({ kind: 'invalid', errorCode: 'duplicate_packet_kind' });

    expect(
      (await client.query(`SELECT count(*)::int AS count FROM generation_context_bundles`)).rows[0]
        .count,
    ).toBe(0);

    // Cross-project bundle binding is rejected by the composite FK even at the
    // port level: a project B bundle cannot reference a project A snapshot.
    await client.query(
      `INSERT INTO context_snapshots
         (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
       VALUES ('snap-A',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
      [ids.projectA, dependencyHash],
    );
    await expect(
      unitOfWork.execute(async (ports) => {
        await ports.contextBundle!.createBundle({
          id: 'bundle-cross',
          projectId: ids.projectB,
          snapshotId: 'snap-A',
          dependencyHash,
          bundleHash: 'e'.repeat(64),
          payload: {},
        });
      }),
    ).rejects.toThrow();
  } finally {
    await prisma.$disconnect();
  }
});
