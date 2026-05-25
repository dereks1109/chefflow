import { useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { downscaleToDataUrl } from '../../core/util/image';
import { getWorkerBaseUrl } from '../../core/util/workerBaseUrl';

const SCREENSHOT_MAX_EDGE = 1600;

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [state, setState] = useState<SendState>({ kind: 'idle' });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setScreenshotError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setScreenshotDataUrl(null);
      setScreenshotName(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Please pick an image file.');
      return;
    }
    try {
      // Same helper the recipe-cover-photo input uses — JPEG, max 1600px edge.
      const dataUrl = await downscaleToDataUrl(file, SCREENSHOT_MAX_EDGE);
      setScreenshotDataUrl(dataUrl);
      setScreenshotName(file.name);
    } catch {
      setScreenshotError('Could not process that image.');
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`${getWorkerBaseUrl().replace(/\/+$/, '')}/contact/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          screenshotDataUrl: screenshotDataUrl ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      setState({ kind: 'success' });
      setName('');
      setEmail('');
      setMessage('');
      setScreenshotDataUrl(null);
      setScreenshotName(null);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not send — please try again.',
      });
    }
  }

  const canSubmit =
    state.kind !== 'sending' &&
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    message.trim().length > 0;

  return (
    <section className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Get in touch</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Found a bug, want a feature, or have feedback on ChefFlow? Drop a line — every
          message goes straight to the person building this.
        </p>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink space-y-3"
        data-testid="contact-form"
      >
        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className="input mt-1"
            data-testid="contact-name"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Your email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
            className="input mt-1"
            data-testid="contact-email-input"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={5}
            maxLength={5000}
            placeholder="Bug reports, feature requests, questions — anything."
            className="input mt-1 resize-y"
            data-testid="contact-message"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            Screenshot (optional)
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void onPickFile(e)}
            className="mt-1 block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-slate-200"
            data-testid="contact-screenshot"
          />
          {screenshotName && (
            <p className="mt-1 text-[11px] text-slate-500">Attached: {screenshotName}</p>
          )}
          {screenshotError && (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400" role="alert">
              {screenshotError}
            </p>
          )}
        </label>

        {state.kind === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 text-xs text-rose-900 dark:text-rose-200"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        )}
        {state.kind === 'success' && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-xs text-emerald-900 dark:text-emerald-200"
          >
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Thanks! Your message was sent.</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="contact-send"
          >
            {state.kind === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Send
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
