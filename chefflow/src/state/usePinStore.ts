import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// usePinStore — optional 4-6 digit PIN that gates Recipe + Event editing.
//
// Threat model: a stranger picking up an unattended phone in the kitchen
// shouldn't be able to silently edit a recipe (or worse, untick an
// allergen flag) just because the chef walked away mid-prep. This is NOT
// a server-enforced auth — the PIN lives in localStorage on the device,
// hashed with a per-install salt via Web Crypto. Anyone with full
// browser access (devtools, localStorage edit) can bypass it; that's
// the same threat model as the Clerk session itself.
//
// Persistence: salt + hash live in localStorage under
// `chefflow:pin-v1`. The "unlocked" flag lives in memory only (Zustand
// non-persisted slice) so a refresh re-asks for the PIN once per session
// per device.
// ---------------------------------------------------------------------------

const HASH_ITERATIONS = 100_000; // PBKDF2 rounds — slow enough that a
                                 // brute-force scan of 10^6 PINs (6-digit
                                 // space) takes a few hours even with a
                                 // local copy of the salt.
const HASH_BITS = 256;

interface PersistedPinState {
  hash: string | null;  // base64 of the derived bits
  salt: string | null;  // base64 of the random salt
}

interface PinStoreState extends PersistedPinState {
  /** Session-only — true after the chef successfully verifies the PIN
   *  this browser session. Refresh / sign-out resets it. */
  unlockedThisSession: boolean;
  /** True when a PIN is currently set on this device. */
  isPinSet(): boolean;
  /** Hash + persist the given PIN. Throws if PIN isn't 4–6 digits. */
  setPin(pin: string): Promise<void>;
  /** Returns true iff `pin` hashes (with the persisted salt) to the
   *  persisted hash. Side-effect: sets `unlockedThisSession=true` on
   *  match so subsequent editor opens skip the gate. */
  verifyPin(pin: string): Promise<boolean>;
  /** Wipe the PIN entirely (used by Settings remove + the forgot-PIN
   *  reset flow). Also clears the session-unlocked flag. */
  clearPin(): void;
  /** Manually clear the session-unlocked flag (e.g. on sign-out). */
  lock(): void;
}

function isValidPinShape(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(pin: string, saltBytes: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  // saltBytes is a typed array view; the WebCrypto API accepts any
  // ArrayBufferView for `salt`. The structural typing in lib.dom.d.ts
  // demands a plain BufferSource here — cast through unknown to satisfy
  // it without re-allocating.
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export const usePinStore = create<PinStoreState>()(
  persist(
    (set, get) => ({
      hash: null,
      salt: null,
      unlockedThisSession: false,
      isPinSet: () => !!get().hash && !!get().salt,
      setPin: async (pin) => {
        if (!isValidPinShape(pin)) {
          throw new Error('PIN must be 4–6 digits');
        }
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const hash = await derive(pin, saltBytes);
        set({
          hash,
          salt: bytesToBase64(saltBytes),
          unlockedThisSession: true,
        });
      },
      verifyPin: async (pin) => {
        const { hash, salt } = get();
        if (!hash || !salt) return false;
        if (!isValidPinShape(pin)) return false;
        const candidate = await derive(pin, base64ToBytes(salt));
        const ok = candidate === hash;
        if (ok) set({ unlockedThisSession: true });
        return ok;
      },
      clearPin: () => set({ hash: null, salt: null, unlockedThisSession: false }),
      lock: () => set({ unlockedThisSession: false }),
    }),
    {
      name: 'chefflow:pin-v1',
      // Don't persist the session-unlocked flag — it must reset on
      // refresh. Default merge persists everything; partialize trims it
      // back to just the salted-hash fields.
      partialize: (state) => ({ hash: state.hash, salt: state.salt }),
    },
  ),
);
