import { describe, it, expect, beforeEach } from 'vitest';
import { useProfileStore } from './useProfileStore';

beforeEach(() => {
  window.localStorage.clear();
  useProfileStore.setState({ displayName: '', avatarDataUrl: null });
});

describe('useProfileStore', () => {
  it('defaults to empty name and null avatar', () => {
    const { displayName, avatarDataUrl } = useProfileStore.getState();
    expect(displayName).toBe('');
    expect(avatarDataUrl).toBeNull();
  });

  it('setDisplayName round-trips the value', () => {
    useProfileStore.getState().setDisplayName('Alice');
    expect(useProfileStore.getState().displayName).toBe('Alice');
  });

  it('setAvatarDataUrl round-trips the value', () => {
    const url = 'data:image/jpeg;base64,abc';
    useProfileStore.getState().setAvatarDataUrl(url);
    expect(useProfileStore.getState().avatarDataUrl).toBe(url);
    useProfileStore.getState().setAvatarDataUrl(null);
    expect(useProfileStore.getState().avatarDataUrl).toBeNull();
  });

  it('clear() resets both fields', () => {
    useProfileStore.getState().setDisplayName('Bob');
    useProfileStore.getState().setAvatarDataUrl('data:image/jpeg;base64,xyz');
    useProfileStore.getState().clear();
    expect(useProfileStore.getState().displayName).toBe('');
    expect(useProfileStore.getState().avatarDataUrl).toBeNull();
  });

  it('persists under chefflow:profile:v1', () => {
    useProfileStore.getState().setDisplayName('Carol');
    expect(window.localStorage.getItem('chefflow:profile:v1')).toContain('Carol');
  });
});
