'use strict';

const StreamResolveCache = require('../src/services/StreamResolveCache');

describe('StreamResolveCache hard-refusal backoff', () => {
  const key = 'damitv:__channel__:dead-channel';

  test('a 403 arms a backoff that skips minting while it lasts', async () => {
    const cache = new StreamResolveCache({ sharedResolver: null });
    const mint = jest.fn(async () => []);

    cache.noteFailure(key, { status: 403 });
    expect(cache.isDead(key)).toBe(true);

    const result = await cache.getOrCreate(key, mint);
    expect(result).toEqual([]);
    expect(mint).not.toHaveBeenCalled();
    expect(cache.statsCounters.deadSkips).toBe(1);
  });

  test('a failure without an HTTP refusal does not arm the backoff', () => {
    const cache = new StreamResolveCache({ sharedResolver: null });
    cache.noteFailure(key);
    expect(cache.isDead(key)).toBe(false);
  });

  test('repeated refusals escalate the window', () => {
    const cache = new StreamResolveCache({ sharedResolver: null });
    cache.noteFailure(key, { status: 404 });
    const first = cache.deadUntil.get(key).until - Date.now();
    cache.noteFailure(key, { status: 404 });
    const second = cache.deadUntil.get(key).until - Date.now();
    expect(second).toBeGreaterThan(first);
  });

  test('a successful probe clears the backoff', () => {
    const cache = new StreamResolveCache({ sharedResolver: null });
    cache.noteFailure(key, { status: 403 });
    cache.noteSuccess(key);
    expect(cache.isDead(key)).toBe(false);
  });
});
