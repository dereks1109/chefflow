// ---------------------------------------------------------------------------
// Hand-rolled validator for the LLM's JSON response.
//
// We don't pull in Zod just for this — the schema is tiny and the validator
// is its own small unit-tested module. LlmValidationError carries the first
// failure's path so the UI can show a precise diagnostic.
// ---------------------------------------------------------------------------

export type LlmPhase = 'prep' | 'cook' | 'serve' | 'sanitize';

export interface LlmStep {
  stepId: string;
  dishId: string;
  recipeStepId: string;
  text: string;
  startAt: string;
  endAt: string;
  durationSec: number;
  phase: LlmPhase;
  rulesApplied: number[];
  warnings: string[];
}

export interface LlmResponse {
  steps: LlmStep[];
}

export class LlmValidationError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(`${message} (at ${path})`);
    this.name = 'LlmValidationError';
    this.path = path;
  }
}

const PHASES: ReadonlySet<string> = new Set(['prep', 'cook', 'serve', 'sanitize']);
const TOLERANCE_MS = 1000;

// ---------------------------------------------------------------------------
// parseLlmResponse — strict + structural. Throws LlmValidationError on any
// shape / type / cross-field mismatch so the caller can surface a clear
// diagnostic to the user.
// ---------------------------------------------------------------------------
export function parseLlmResponse(raw: unknown): LlmResponse {
  if (!raw || typeof raw !== 'object') {
    throw new LlmValidationError('Response is not a JSON object', 'root');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.steps)) {
    throw new LlmValidationError('Missing "steps" array', 'steps');
  }

  const steps: LlmStep[] = obj.steps.map((s, i) => validateStep(s, `steps[${i}]`));

  // Cross-field invariant: every step's startAt + durationSec*1000 ≈ endAt.
  steps.forEach((step, i) => {
    const startMs = Date.parse(step.startAt);
    const endMs = Date.parse(step.endAt);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new LlmValidationError('Unparseable datetime', `steps[${i}]`);
    }
    const expectedEnd = startMs + step.durationSec * 1000;
    if (Math.abs(expectedEnd - endMs) > TOLERANCE_MS) {
      throw new LlmValidationError(
        `Time arithmetic mismatch: startAt + durationSec*1000 != endAt (delta ${endMs - expectedEnd}ms)`,
        `steps[${i}]`,
      );
    }
  });

  return { steps };
}

function validateStep(raw: unknown, path: string): LlmStep {
  if (!raw || typeof raw !== 'object') {
    throw new LlmValidationError('Step is not an object', path);
  }
  const s = raw as Record<string, unknown>;
  const str = (k: string): string => {
    if (typeof s[k] !== 'string' || s[k] === '') {
      throw new LlmValidationError(`Field "${k}" missing or not a string`, path);
    }
    return s[k] as string;
  };
  const num = (k: string): number => {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
      throw new LlmValidationError(`Field "${k}" missing or not a number`, path);
    }
    return s[k] as number;
  };
  const numArr = (k: string): number[] => {
    if (!Array.isArray(s[k])) {
      throw new LlmValidationError(`Field "${k}" missing or not an array`, path);
    }
    const arr = s[k] as unknown[];
    for (const v of arr) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new LlmValidationError(`Field "${k}" contains non-number`, path);
      }
    }
    return arr as number[];
  };
  const strArr = (k: string): string[] => {
    if (!Array.isArray(s[k])) {
      throw new LlmValidationError(`Field "${k}" missing or not an array`, path);
    }
    const arr = s[k] as unknown[];
    for (const v of arr) {
      if (typeof v !== 'string') {
        throw new LlmValidationError(`Field "${k}" contains non-string`, path);
      }
    }
    return arr as string[];
  };

  const phase = s.phase as string;
  if (!PHASES.has(phase)) {
    throw new LlmValidationError(`Field "phase" must be prep|cook|serve|sanitize (got ${JSON.stringify(s.phase)})`, path);
  }

  return {
    stepId: str('stepId'),
    // dishId can be empty for sanitize injections — accept '' but require the key.
    dishId: typeof s.dishId === 'string' ? s.dishId : (() => {
      throw new LlmValidationError('Field "dishId" missing or not a string', path);
    })(),
    recipeStepId: str('recipeStepId'),
    text: str('text'),
    startAt: str('startAt'),
    endAt: str('endAt'),
    durationSec: num('durationSec'),
    phase: phase as LlmPhase,
    rulesApplied: numArr('rulesApplied'),
    warnings: strArr('warnings'),
  };
}

// ---------------------------------------------------------------------------
// assertCoversEvent — semantic check that the LLM didn't drop a dish on the
// floor and that the chronologically last step ends at the event's serveAt.
// Separate from parseLlmResponse so the caller can run both with separate
// error handling (parse errors vs. coverage errors look different in the UI).
// ---------------------------------------------------------------------------
export interface CoverageCheckInput {
  steps: LlmStep[];
  dishIdsRequiringCoverage: ReadonlySet<string>;
  serveAt: string;
}

export function assertCoversEvent({ steps, dishIdsRequiringCoverage, serveAt }: CoverageCheckInput): void {
  // Every requested dish must have at least one step.
  for (const dishId of dishIdsRequiringCoverage) {
    if (!steps.some((s) => s.dishId === dishId)) {
      throw new LlmValidationError(`No step for dish ${dishId}`, 'coverage');
    }
  }
  if (steps.length === 0) return;
  // Last step (chronologically) must end at serveAt.
  const lastEnd = steps.reduce((max, s) => {
    const t = Date.parse(s.endAt);
    return t > max ? t : max;
  }, -Infinity);
  const target = Date.parse(serveAt);
  if (Number.isNaN(target)) throw new LlmValidationError('serveAt is not parseable', 'coverage');
  if (Math.abs(lastEnd - target) > TOLERANCE_MS) {
    throw new LlmValidationError(
      `Last step's endAt does not match event.serveAt (delta ${lastEnd - target}ms)`,
      'coverage',
    );
  }
}
