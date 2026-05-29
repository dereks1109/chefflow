import { useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { UserRound } from 'lucide-react';
import Button from './primitives/Button';
import { useProfileStore } from '../../state/useProfileStore';
import { downscaleToDataUrl } from '../../core/util/image';
import { completeOnboarding } from '../../core/onboarding/onboardingClient';
import { useTourState } from '../../state/useTourState';
import {
  CURRENT_TOS_VERSION,
  CURRENT_DISCLAIMER_VERSION,
} from '../../core/legal/versions';

interface Props {
  onDone: () => void;
}

// Modal sheet shown to first-time signed-in users. Three fields mirror the
// SettingsPage profile section. Both Skip and Save call the worker to set
// publicMetadata.onboardingComplete = true; the difference is whether the
// profile slice is filled. On any error the sheet stays open with a retry.

export default function OnboardingSheet({ onDone }: Props) {
  const setDisplayName = useProfileStore((s) => s.setDisplayName);
  const setAvatarDataUrl = useProfileStore((s) => s.setAvatarDataUrl);
  const setShowNameOnCommunityStore = useProfileStore((s) => s.setShowNameOnCommunity);

  const { getToken } = useAuth();

  const [nameDraft, setNameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [showNameDraft, setShowNameDraft] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    try {
      setAvatarDraft(await downscaleToDataUrl(file, 512));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not process image');
    }
  }

  async function submit(skip: boolean) {
    // Hard guard: the buttons are disabled when !accepted, but defend
    // against a tester removing the disabled attr via devtools.
    if (!accepted) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // Persist locally first so even if the worker call fails we keep
      // whatever the user typed. Skip path writes nothing locally.
      if (!skip) {
        const trimmedName = nameDraft.trim();
        if (trimmedName.length > 0) setDisplayName(trimmedName);
        if (avatarDraft) setAvatarDataUrl(avatarDraft);
        setShowNameOnCommunityStore(showNameDraft);
      }
      const tosFields = {
        tosAcceptedAt: new Date().toISOString(),
        tosVersion: CURRENT_TOS_VERSION,
        disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
      };
      await completeOnboarding({
        getToken,
        fields: skip
          ? tosFields
          : {
              ...tosFields,
              displayName: nameDraft.trim() || undefined,
              showNameOnCommunity: showNameDraft,
            },
      });
      onDone();
      // Kick off the 4-step product tour for first-time chefs.
      // useTourState.start() self-skips if the dismiss flag is already
      // set in localStorage (e.g. the chef dismissed a prior tour on
      // this device), so this call is safe to make unconditionally.
      // Deferred to next tick so OnboardingGate has time to unmount
      // this sheet + paint the nav before the tour tries to spotlight
      // its targets.
      setTimeout(() => useTourState.getState().start(), 50);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save — please retry');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-heading"
      data-testid="onboarding-sheet"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-6 shadow-2xl">
        <h2
          id="onboarding-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Welcome to ChefFlow
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          A few quick details so your community recipes don't show up as
          "Anonymous chef". You can change everything later in Settings.
        </p>

        <div className="mt-5 flex items-start gap-4">
          <div className="shrink-0">
            {avatarDraft ? (
              <img
                src={avatarDraft}
                alt="Profile avatar preview"
                data-testid="onboarding-avatar-img"
                className="h-16 w-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div
                aria-label="No profile photo selected"
                className="h-16 w-16 rounded-full flex items-center justify-center bg-slate-100 dark:bg-surface-2 text-slate-400 border border-slate-200 dark:border-slate-700"
              >
                {nameDraft.trim().length > 0 ? (
                  <span className="text-lg font-semibold text-slate-500 dark:text-slate-300">
                    {nameDraft.trim().charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserRound className="h-7 w-7" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarPick(e)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="onboarding-photo-pick"
              className="text-sm text-accent hover:underline"
            >
              {avatarDraft ? 'Change photo' : 'Add photo (optional)'}
            </button>
            {avatarError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {avatarError}
              </p>
            )}
            <label className="block">
              <span className="text-xs text-slate-500">Display name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                data-testid="onboarding-name-input"
                autoFocus
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showNameDraft}
                onChange={(e) => setShowNameDraft(e.target.checked)}
                data-testid="onboarding-show-name"
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
              />
              <span className="text-slate-700 dark:text-slate-200">
                Show my name on community recipes
                <span className="block text-slate-500">
                  When off, recipes you publish appear as "Anonymous chef".
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              data-testid="onboarding-tos-accept"
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
            />
            <span className="text-slate-700 dark:text-slate-200 leading-snug">
              I have read and accept the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
                data-testid="onboarding-tos-link"
              >
                Terms of Service
              </a>
              ,{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
                data-testid="onboarding-privacy-link"
              >
                Privacy Policy
              </a>
              , and the{' '}
              <a
                href="/disclaimer"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
                data-testid="onboarding-disclaimer-link"
              >
                Disclaimer
              </a>
              . I understand ChefFlow does not detect allergens and I am the
              food business operator responsible for verifying allergens
              against my supplier labels under the Food Information
              Regulations 2014.
            </span>
          </label>
        </div>

        {submitError && (
          <p
            role="alert"
            data-testid="onboarding-error"
            className="mt-4 text-xs text-red-600 dark:text-red-400"
          >
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void submit(true)}
            disabled={submitting || !accepted}
            data-testid="onboarding-skip"
          >
            Skip for now
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void submit(false)}
            disabled={submitting || !accepted}
            data-testid="onboarding-save"
          >
            {submitting ? 'Saving…' : 'Save and continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
