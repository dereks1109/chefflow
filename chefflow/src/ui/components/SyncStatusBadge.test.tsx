import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import SyncStatusBadge from './SyncStatusBadge';
import { useSyncStore } from '../../state/useSyncStore';
import { db } from '../../db/dexie';

const runSyncMock = vi.hoisted(() => vi.fn());
vi.mock('../../core/sync/syncEngine', () => ({
  runSync: runSyncMock,
}));

beforeEach(async () => {
  useSyncStore.getState().reset();
  await db.recipes.clear();
  await db.events.clear();
  await db.menus.clear();
  await db.allergenAudits.clear();
  runSyncMock.mockClear();
});

afterEach(() => {
  cleanup();
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('SyncStatusBadge', () => {
  it('renders nothing when no owner is set (anon)', () => {
    render(<SyncStatusBadge />);
    expect(screen.queryByTestId('sync-status-badge')).toBeNull();
  });

  it('renders "Synced just now" when status=idle and lastPulledAt is recent', () => {
    act(() => {
      useSyncStore.getState().switchToUser('user_alice');
      useSyncStore.getState().setLastPulledAt(Date.now());
    });
    render(<SyncStatusBadge />);
    const badge = screen.getByTestId('sync-status-badge');
    expect(badge.textContent).toContain('Synced just now');
  });

  it('renders "Syncing…" when status=syncing', () => {
    act(() => {
      useSyncStore.getState().switchToUser('user_alice');
      useSyncStore.getState().setStatus('syncing');
    });
    render(<SyncStatusBadge />);
    expect(screen.getByTestId('sync-status-badge').textContent).toContain('Syncing');
  });

  it('renders "Sync error" with the last error in the tooltip, and triggers runSync on click', () => {
    act(() => {
      useSyncStore.getState().switchToUser('user_alice');
      useSyncStore.getState().setStatus('error');
      useSyncStore.getState().setLastError('HTTP 502 from /api/sync/push');
    });
    render(<SyncStatusBadge />);
    const badge = screen.getByTestId('sync-status-badge');
    expect(badge.textContent).toContain('Sync error');
    expect(badge.getAttribute('title')).toBe('HTTP 502 from /api/sync/push');

    fireEvent.click(badge);
    expect(runSyncMock).toHaveBeenCalledTimes(1);
  });

  it('renders "Offline — N pending" when navigator goes offline and Dexie has unsynced rows', async () => {
    const now = Date.now();
    await db.recipes.put({
      id: 'r1',
      title: 'Test',
      userId: 'user_alice',
      ingredients: [],
      steps: [],
      originalYield: 1,
      createdAt: now,
      updatedAt: now,
      synced: false,
    });
    await db.events.put({
      id: 'e1',
      title: 'Dinner',
      userId: 'user_alice',
      notes: '',
      dishes: [],
      createdAt: now,
      updatedAt: now,
      synced: false,
    });

    act(() => {
      useSyncStore.getState().switchToUser('user_alice');
    });
    setOnline(false);

    render(<SyncStatusBadge />);
    await waitFor(() => {
      const text = screen.getByTestId('sync-status-badge').textContent ?? '';
      expect(text).toContain('Offline');
      expect(text).toContain('2 pending');
    });

    setOnline(true);
  });
});
