/**
 * createProject(jalur) — project + intake session + opening template message.
 * No AI. Opening copy is static per path (M2); AI intake reply lands in M4.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ProjectRecord, IntakeSessionRecord, IntakeMessageRecord } from '../ports/types.js';

/** Product jalur (UI). "has_draft" disabled D2. */
export type IntakeJalur =
  | 'no_idea'
  | 'rough_idea'
  | 'has_outline'
  | 'fix_story';

/** Schema CHECK projects_intake_path_check. */
export type IntakePathDb = 'guided' | 'freeform';

const OPENERS: Record<IntakeJalur, string> = {
  no_idea:
    'Ceritakan suasana atau perasaan yang ingin kamu tulis. Nanti kita susun bareng.',
  rough_idea:
    'Tulis ide kasarmu dalam beberapa kalimat. Aku bantu merapikan fondasinya.',
  has_outline: 'Tempel atau ringkas outline-mu. Kita petakan ke bab dan adegan.',
  fix_story: 'Ceritakan bagian mana yang terasa macet atau tidak nyambung.',
};

/** Map product jalur → DB intake_path (guided = structured, freeform = open). */
export function jalurToIntakePath(jalur: IntakeJalur): IntakePathDb {
  switch (jalur) {
    case 'no_idea':
    case 'rough_idea':
      return 'guided';
    case 'has_outline':
    case 'fix_story':
      return 'freeform';
  }
}

export interface CreateProjectInput {
  readonly ownerUserId: string;
  readonly jalur: string;
  readonly title?: string;
}

export interface CreateProjectOutput {
  readonly project: ProjectRecord;
  readonly intakeSession: IntakeSessionRecord;
  readonly openingMessage: IntakeMessageRecord;
}

const ALLOWED_JALUR = new Set<string>(['no_idea', 'rough_idea', 'has_outline', 'fix_story']);

export function createCreateProject(
  uow: UnitOfWork,
): (input: CreateProjectInput) => Promise<Result<CreateProjectOutput, AppError>> {
  return async (input) => {
    if (input.jalur === 'has_draft') {
      return err(
        appError('VALIDATION', 'msg.project.jalur_draft_disabled', 422, {
          jalur: input.jalur,
        }),
      );
    }
    if (!ALLOWED_JALUR.has(input.jalur)) {
      return err(
        appError('VALIDATION', 'msg.project.jalur_invalid', 422, { jalur: input.jalur }),
      );
    }
    const jalur = input.jalur as IntakeJalur;
    const title = (input.title?.trim() || 'Cerita baru').slice(0, 200);
    const intakePath = jalurToIntakePath(jalur);
    const opener = OPENERS[jalur];

    try {
      const outcome = await uow.execute(async (ports) => {
        const projectId = ports.allocateId();
        const sessionId = ports.allocateId();
        const messageId = ports.allocateId();

        const project = await ports.project.insert({
          id: projectId,
          ownerUserId: input.ownerUserId,
          title,
          intakePath,
          status: 'active',
        });

        const intakeSession = await ports.intake.insertSession({
          id: sessionId,
          projectId,
          status: 'active',
          signalCount: 0,
          payload: { jalur },
        });

        // Opening assistant template — sequence 0 (schema allows sequence >= 0).
        const openingMessage = await ports.intake.insertMessage({
          id: messageId,
          projectId,
          intakeSessionId: sessionId,
          role: 'assistant',
          sequence: 0,
          content: opener,
        });

        await ports.audit.append({
          userId: input.ownerUserId,
          action: 'project.created',
          entityType: 'project',
          entityId: projectId,
          metadata: { jalur, intakePath },
        });

        return { project, intakeSession, openingMessage };
      });
      return ok(outcome);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        appError('VALIDATION', 'msg.project.create_failed', 500, { message }),
      );
    }
  };
}

export { OPENERS };
