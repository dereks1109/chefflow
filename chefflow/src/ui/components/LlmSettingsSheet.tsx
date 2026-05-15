import { useEffect, useRef, useState } from 'react';
import { Key, X } from 'lucide-react';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LlmSettingsSheet({ open, onClose }: Props) {
  const storedKey = useLlmSettingsStore((s) => s.apiKey);
  const setApiKey = useLlmSettingsStore((s) => s.setApiKey);
  const clear = useLlmSettingsStore((s) => s.clear);
  const model = useLlmSettingsStore((s) => s.model);

  const [draft, setDraft] = useState(storedKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(storedKey);
      // Focus on next tick so the modal mount completes first.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, storedKey]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave() {
    setApiKey(draft.trim());
    onClose();
  }

  function handleForget() {
    if (!window.confirm('Forget the stored API key from this browser?')) return;
    clear();
    setDraft('');
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm-settings-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 id="llm-settings-title" className="font-semibold inline-flex items-center gap-2">
            <Key className="h-4 w-4" aria-hidden="true" />
            Connect to Groq
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            ChefFlow uses Groq's free tier to turn your events into kitchen workflows.
            Sign up at{' '}
            <a
              href="https://console.groq.com"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              console.groq.com
            </a>
            , create an API key, then paste it below.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Groq API key</span>
            <input
              ref={inputRef}
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="gsk_..."
              autoComplete="off"
              className="input mt-1 font-mono"
              aria-label="Groq API key"
            />
          </label>

          <p className="text-xs text-slate-500">
            Model: <span className="font-medium text-slate-700 dark:text-slate-300">{model}</span>
          </p>

          <p className="text-xs text-slate-500">
            Stored locally in your browser's <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">localStorage</code>.
            Never committed to git, never sent to ChefFlow servers. Use{' '}
            <strong>Forget</strong> to wipe it.
          </p>

          <p className="text-xs text-slate-500">
            <strong>Privacy:</strong> your event title, dish names, and recipe step text are sent to Groq to
            generate the workflow.
          </p>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleForget}
            disabled={!storedKey}
            className="btn-secondary text-sm disabled:opacity-40"
            aria-label="Forget stored API key"
          >
            Forget
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={draft.trim().length === 0}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save key
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
