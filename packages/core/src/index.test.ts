import { describe, expect, expectTypeOf, it } from 'vitest';
import { CORE_PACKAGE, auth, dependency, foundation, narrative, prose } from './index.js';

describe('@narraza/core public barrel', () => {
  it('exposes package namespaces and public runtime APIs', () => {
    expect(CORE_PACKAGE).toBe('@narraza/core');
    expect(auth).toBeTypeOf('object');

    for (const value of [
      narrative.createNarrativePosition,
      narrative.compareNarrativePositions,
      narrative.narrativePositionsEqual,
      narrative.buildRevealViews,
      narrative.decideExpression,
      narrative.foldBeliefEvents,
      narrative.foldDisclosureEvents,
      foundation.calculateFoundationReadiness,
      dependency.canonicalJson,
      dependency.canonicalSha256,
      dependency.sha256Hex,
      dependency.dependencyKey,
      dependency.buildDependencyManifest,
      dependency.dependencyManifestHash,
      dependency.evaluateDependencyStatus,
      prose.assertAcceptedProseImmutable,
      prose.decideWorkingDraftUpdate,
      prose.decideAcceptedPointer,
      prose.isValidationBindingCurrent,
      prose.repairBlockerFingerprint,
      prose.decideRepairStop,
    ]) {
      expect(value).toBeTypeOf('function');
    }
  });

  it('exposes public types but omits internal helpers', () => {
    expectTypeOf<narrative.NarrativePosition>().toMatchTypeOf<{
      readonly chapterId: string;
      readonly sequence: number;
    }>();
    expectTypeOf<foundation.ReadinessResult['percent']>().toEqualTypeOf<number>();
    expectTypeOf<dependency.DependencyStatus>().toEqualTypeOf<
      'current' | 'needs_revalidation' | 'stale'
    >();
    expectTypeOf<prose.RepairStopDecision['shouldStop']>().toEqualTypeOf<boolean>();

    expectTypeOf(narrative).not.toHaveProperty('parseCanonicalTimestamp');
    expectTypeOf(narrative).not.toHaveProperty('parseExpression');
    expectTypeOf(dependency).not.toHaveProperty('validateDependencyManifest');
    expectTypeOf(dependency).not.toHaveProperty('exactObject');
    expectTypeOf(prose).not.toHaveProperty('parseBlockers');
  });
});
