import type { KitchenEvent, Recipe, ScheduledStep } from '../types';
import { scheduleEvent } from './scheduleEvent';
import { scheduleEventLLM, GroqClientError, LlmValidationError } from './llm/llmScheduler';

// ---------------------------------------------------------------------------
// scheduleWithFallback — single seam where the workflow page decides between
// the LLM scheduler (production) and the local deterministic scheduler
// (test + offline fallback). Lifted out of Workflow.tsx so:
//   - the LLM-vs-local decision is a pure function the test can drive
//     directly, instead of an effect+state machine inside a 700-line page;
//   - errors are propagated structurally (warnings array + thrown only when
//     BOTH paths fail) instead of silently swallowed;
//   - any future change (retry policy, telemetry, A/B between models) lives
//     in one place.
// ---------------------------------------------------------------------------

export interface StrategyInput {
  event: KitchenEvent;
  recipes: Map<string, Recipe>;
  /** Pass empty string / undefined to force the local scheduler. */
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export type StrategySource = 'llm' | 'local';

/**
 * Discriminated warning codes — structured rather than a string so the UI
 * can render context-aware affordances (retry on 429, prompt for key on
 * 401, "report bad LLM output" on validation, etc.). `cause` preserves the
 * original Error for telemetry.
 */
export type StrategyWarningCode =
  | 'llm-auth'        // 401 — bad / missing API key
  | 'llm-rate-limit'  // 429 — too many requests
  | 'llm-transport'   // network / 5xx / unknown HTTP error from Groq
  | 'llm-validation'  // model returned malformed JSON or coverage failed
  | 'llm-unknown';    // any other thrown error from the LLM path

export interface StrategyWarning {
  code: StrategyWarningCode;
  message: string;
  cause?: unknown;
}

export interface StrategyResult {
  steps: ScheduledStep[];
  /** Which scheduler produced the timeline. UI uses this to render the
   *  "Fallback timeline" notice when source==='local'. */
  source: StrategySource;
  /** Non-fatal warnings — populated when the LLM path failed and we fell
   *  through to local. Empty when the LLM path succeeded. */
  warnings: StrategyWarning[];
  /** Echoed back for telemetry parity with scheduleEventLLM. */
  modelUsed?: string;
}

export class StrategyError extends Error {
  /** Original LLM error (if any). Preserved so the UI can show its message. */
  readonly llmError: unknown;
  /** Original local-scheduler error (if any). */
  readonly localError: unknown;
  constructor(message: string, opts: { llmError?: unknown; localError?: unknown }) {
    super(message);
    this.name = 'StrategyError';
    this.llmError = opts.llmError;
    this.localError = opts.localError;
  }
}

/**
 * Schedule a workflow with LLM-preferred / local-fallback semantics:
 *   - No API key (or empty model) → local scheduler. Never throws unless
 *     local itself throws (StrategyError).
 *   - API key present → try LLM. On any thrown error (network, parse,
 *     coverage assertion) fall through to local with a warning. If local
 *     succeeds, return source='local' + warnings. If local ALSO throws,
 *     throw StrategyError carrying both errors.
 *
 * The signal is forwarded to the LLM call only — local is synchronous and
 * not abortable.
 */
export async function scheduleWithFallback(input: StrategyInput): Promise<StrategyResult> {
  const llmAvailable = input.apiKey.length > 0 && input.model.length > 0;

  if (!llmAvailable) {
    return runLocal(input, []);
  }

  let llmError: unknown;
  try {
    const result = await scheduleEventLLM({
      event: input.event,
      recipes: input.recipes,
      apiKey: input.apiKey,
      model: input.model,
      signal: input.signal,
    });
    return {
      steps: result.steps,
      source: 'llm',
      warnings: [],
      modelUsed: result.modelUsed,
    };
  } catch (err) {
    if (input.signal?.aborted) throw err;
    llmError = err;
    // Fall through to local. Build a structured warning so the UI can
    // render code-specific affordances next to the fallback timeline.
    const warning = classifyLlmError(err);
    return runLocal(input, [warning], llmError);
  }
}

function runLocal(
  input: StrategyInput,
  warnings: StrategyWarning[],
  llmError?: unknown,
): StrategyResult {
  try {
    const steps = scheduleEvent({ event: input.event, recipes: input.recipes });
    return { steps, source: 'local', warnings };
  } catch (localError) {
    // Both paths down — propagate structurally so the caller can show the
    // real LLM error (more user-actionable) without silently masking a
    // local-scheduler bug.
    console.warn('[scheduler/strategy] local scheduler threw', localError);
    throw new StrategyError(
      llmError
        ? 'LLM scheduler failed and the local fallback also threw.'
        : 'Local scheduler threw.',
      { llmError, localError },
    );
  }
}

function classifyLlmError(err: unknown): StrategyWarning {
  if (err instanceof GroqClientError) {
    if (err.status === 401) return { code: 'llm-auth', message: 'LLM auth failed — using local fallback.', cause: err };
    if (err.status === 429) return { code: 'llm-rate-limit', message: 'LLM rate-limited — using local fallback.', cause: err };
    return { code: 'llm-transport', message: 'LLM transport error — using local fallback.', cause: err };
  }
  if (err instanceof LlmValidationError) {
    return { code: 'llm-validation', message: 'LLM returned an invalid workflow — using local fallback.', cause: err };
  }
  if (err instanceof Error) {
    return { code: 'llm-unknown', message: `LLM failed (${err.message}) — using local fallback.`, cause: err };
  }
  return { code: 'llm-unknown', message: 'LLM failed — using local fallback.' };
}
