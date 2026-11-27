'use strict';

jest.mock('../src/services/DaddyLiveMediaCheck', () => ({
  checkDaddyLiveMedia: jest.fn(async () => ({ status: 'ok' }))
}));

const Provider = require('../src/providers/DaddyLiveProvider');
const { OutboundBlockedError } = require('../src/services/GuardedOutbound');
test('tries a second iframe when the first fails', async () => {
  const circuitBreaker = { wrap: () => ({ fire: async () => null }), wrapSync: () => ({ fire: async () => null }) };
  const p = new Provider({ circuitBreaker }); p.baseDomains = ['https://provider.example.invalid']; p.folders = ['stream'];
  p.proxyFetch = jest.fn(async url => {
    if (url.includes('/stream-')) return { ok: true, text: async () => '<iframe src="https://first.invalid/"></iframe><iframe src="https://second.invalid/"></iframe>' };
    if (url.includes('first.invalid')) throw new Error('fixture failure');
    return { ok: true, text: async () => '<html></html>' };
  });
  p._resolveFromHtml = jest.fn(async () => ({ url: 'https://cdn.example.invalid/live.m3u8' }));
  const streams = await p.resolveStream('123', 'football', 'Fixture');
  expect(p.proxyFetch.mock.calls.some(([url]) => url.includes('second.invalid'))).toBe(true);
  expect(streams.some(stream => stream.url && stream.url.includes('/api/manifest'))).toBe(true);
});

function providerWithBrokenIframe(error) {
  const circuitBreaker = { wrap: () => ({ fire: async () => null }), wrapSync: () => ({ fire: async () => null }) };
  const provider = new Provider({ circuitBreaker });
  provider.baseDomains = ['https://provider.example.invalid'];
  provider.folders = ['stream'];
  provider.proxyFetch = jest.fn(async url => {
    if (url.includes('/stream-')) return { ok: true, text: async () => '<iframe src="https://first.invalid/"></iframe><iframe src="https://second.invalid/"></iframe>' };
    if (url.includes('first.invalid')) throw error;
    return { ok: true, text: async () => '<html></html>' };
  });
  provider._resolveFromHtml = jest.fn(async () => ({ url: 'https://cdn.example.invalid/live.m3u8' }));
  return provider;
}

test.each([false, true])('a DNS-refused iframe does not abort a healthy independent candidate (wrapped=%s)', async wrapped => {
  const refusal = new OutboundBlockedError('dns_resolution_failed');
  const error = wrapped ? new Error('fetch failed', { cause: refusal }) : refusal;
  const provider = providerWithBrokenIframe(error);
  const streams = await provider.resolveStream('123', 'football', 'Fixture');
  expect(provider.proxyFetch.mock.calls.some(([url]) => url.includes('second.invalid'))).toBe(true);
  expect(streams.some(stream => stream.url && stream.url.includes('/api/manifest'))).toBe(true);
  expect(provider._resolveFromHtml).toHaveBeenCalledTimes(1);
});

test.each(['blocked_address', 'host_not_allowlisted', 'invalid_url', 'url_credentials'])('policy refusal remains fatal: %s', async reason => {
  const error = new OutboundBlockedError(reason);
  const provider = providerWithBrokenIframe(error);
  await expect(provider.resolveStream('123', 'football', 'Fixture')).rejects.toBe(error);
  expect(provider.proxyFetch.mock.calls.some(([url]) => url.includes('second.invalid'))).toBe(false);
});

test('a policy refusal hidden below a DNS wrapper remains fatal', async () => {
  const error = new OutboundBlockedError('dns_resolution_failed');
  error.cause = new OutboundBlockedError('blocked_address');
  const provider = providerWithBrokenIframe(error);
  await expect(provider.resolveStream('123', 'football', 'Fixture')).rejects.toBe(error);
  expect(provider.proxyFetch.mock.calls.some(([url]) => url.includes('second.invalid'))).toBe(false);
});
