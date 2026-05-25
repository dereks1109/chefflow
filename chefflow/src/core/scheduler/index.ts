// ---------------------------------------------------------------------------
// scheduler/ public surface.
//
// Callers (Workflow.tsx, tests, future API routes) should import from here,
// not from internal modules. That way the strategy is the only seam — the
// llmScheduler / scheduleEvent / scaleStepDurations internals can be
// reshuffled without rippling through call sites.
//
// Note: `GroqClientError` / `LlmValidationError` are intentionally re-exported
// because the UI's friendlyError() switches on them to render context-aware
// hints. Future work: promote the strategy warning channel to a structured
// `{code, message, cause}` shape so the UI can stop reaching for these
// directly.
// ---------------------------------------------------------------------------

export { scheduleWithFallback, StrategyError } from './strategy';
export type { StrategyInput, StrategyResult, StrategySource, StrategyWarning, StrategyWarningCode } from './strategy';
export { GroqClientError, LlmValidationError } from './llm/llmScheduler';
export { hashDishes } from './hash';
