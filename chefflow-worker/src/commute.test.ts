import { describe, it, expect, vi } from 'vitest';
import { estimateCommute, CommuteError } from './commute';

function makeFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status }),
  ) as unknown as typeof fetch;
}

const OK_RESPONSE = {
  status: 'OK',
  origin_addresses: ['221B Baker St, London NW1 6XE, UK'],
  destination_addresses: ['Buckingham Palace, London SW1A 1AA, UK'],
  rows: [{
    elements: [{
      status: 'OK',
      duration: { value: 1800, text: '30 mins' },
      distance: { value: 5400, text: '5.4 km' },
    }],
  }],
};

describe('estimateCommute', () => {
  it('returns parsed duration + distance + resolved addresses on the happy path', async () => {
    const out = await estimateCommute({
      apiKey: 'k',
      origin: 'home',
      destination: 'palace',
      fetchImpl: makeFetch(OK_RESPONSE),
    });
    expect(out.durationSeconds).toBe(1800);
    expect(out.distanceMeters).toBe(5400);
    expect(out.resolvedOrigin).toContain('Baker St');
    expect(out.resolvedDestination).toContain('Buckingham');
  });

  it('throws CommuteError 400 when origin or destination is empty', async () => {
    await expect(
      estimateCommute({ apiKey: 'k', origin: '   ', destination: 'x', fetchImpl: makeFetch(OK_RESPONSE) }),
    ).rejects.toBeInstanceOf(CommuteError);
    await expect(
      estimateCommute({ apiKey: 'k', origin: 'x', destination: '', fetchImpl: makeFetch(OK_RESPONSE) }),
    ).rejects.toBeInstanceOf(CommuteError);
  });

  it('throws CommuteError when Google returns a non-OK top-level status', async () => {
    const fetchImpl = makeFetch({ status: 'REQUEST_DENIED', error_message: 'bad key' });
    await expect(
      estimateCommute({ apiKey: 'k', origin: 'a', destination: 'b', fetchImpl }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws CommuteError when the row element status is ZERO_RESULTS', async () => {
    const fetchImpl = makeFetch({
      status: 'OK',
      origin_addresses: ['x'],
      destination_addresses: ['y'],
      rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }],
    });
    await expect(
      estimateCommute({ apiKey: 'k', origin: 'a', destination: 'b', fetchImpl }),
    ).rejects.toBeInstanceOf(CommuteError);
  });
});
