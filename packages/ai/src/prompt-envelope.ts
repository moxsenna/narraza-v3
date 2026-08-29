import type { JsonObject } from './json.js';

/**
 * Prompt envelope (D13, Block C).
 *
 * Story/user content is DATA, never interpolated as a trusted system
 * directive. Every user-content block is wrapped in an explicit, versioned
 * delimiter whose closing tag is escaped inside the content itself, so
 * adversarial story text ("ignore previous instructions") stays inside the
 * data region no matter what it contains. Deterministic: the same inputs
 * render the same prompts byte-for-byte.
 */

export const PROMPT_ENVELOPE_VERSION = 1 as const;
const OPEN = '<user_content>';
const CLOSE = '</user_content>';

export interface PromptContentBlock {
  readonly label: string;
  readonly content: string;
}

export interface RenderPromptInput {
  readonly systemInstructions: string;
  readonly blocks: readonly PromptContentBlock[];
  /** Structured output contract description appended to the system prompt. */
  readonly outputContract?: JsonObject;
}

export interface RenderedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

/** Escape any delimiter-closing sequence inside user content. */
function escapeContent(content: string): string {
  return content.split(CLOSE).join(`<\\/user_content${'>'}`);
}

export function renderPrompt(input: RenderPromptInput): RenderedPrompt {
  const contract = input.outputContract
    ? `\nOUTPUT CONTRACT (strict; additional properties rejected): ${JSON.stringify(input.outputContract)}`
    : '';
  const systemPrompt = `v${PROMPT_ENVELOPE_VERSION}\n${input.systemInstructions.trim()}${contract}`;

  const userPrompt = input.blocks
    .map((block) => `${OPEN} label="${block.label}"\n${escapeContent(block.content)}\n${CLOSE}`)
    .join('\n');

  return { systemPrompt, userPrompt };
}
