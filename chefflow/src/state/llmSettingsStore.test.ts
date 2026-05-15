import { describe, it, expect, beforeEach } from 'vitest';
import { useLlmSettingsStore, DEFAULT_GROQ_MODEL } from './llmSettingsStore';

beforeEach(() => {
  window.localStorage.clear();
  useLlmSettingsStore.setState({ apiKey: '', model: DEFAULT_GROQ_MODEL });
});

describe('llmSettingsStore', () => {
  it('defaults to empty key + Llama 3.3 70B', () => {
    const { apiKey, model } = useLlmSettingsStore.getState();
    expect(apiKey).toBe('');
    expect(model).toBe(DEFAULT_GROQ_MODEL);
  });

  it('isReady() is false when no key', () => {
    expect(useLlmSettingsStore.getState().isReady()).toBe(false);
  });

  it('setApiKey persists and isReady becomes true', () => {
    useLlmSettingsStore.getState().setApiKey('gsk_test_abc');
    expect(useLlmSettingsStore.getState().apiKey).toBe('gsk_test_abc');
    expect(useLlmSettingsStore.getState().isReady()).toBe(true);
    expect(window.localStorage.getItem('chefflow:llm-settings')).toContain('gsk_test_abc');
  });

  it('clear() wipes the key and resets the model', () => {
    useLlmSettingsStore.getState().setApiKey('gsk_test_abc');
    useLlmSettingsStore.getState().setModel('some-other');
    useLlmSettingsStore.getState().clear();
    expect(useLlmSettingsStore.getState().apiKey).toBe('');
    expect(useLlmSettingsStore.getState().model).toBe(DEFAULT_GROQ_MODEL);
    expect(useLlmSettingsStore.getState().isReady()).toBe(false);
  });

  it('treats whitespace-only key as not ready', () => {
    useLlmSettingsStore.getState().setApiKey('   \n');
    expect(useLlmSettingsStore.getState().isReady()).toBe(false);
  });
});
