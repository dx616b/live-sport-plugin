'use strict';

const dns = require('dns');
const { checkOutboundUrl, clearDnsCache } = require('../src/services/OutboundUrlGuard');

describe('OutboundUrlGuard default resolver', () => {
  let lookupSpy;

  beforeEach(() => {
    clearDnsCache();
    lookupSpy = jest.spyOn(dns.promises, 'lookup');
  });

  afterEach(() => {
    lookupSpy.mockRestore();
    clearDnsCache();
  });

  test('always asks DNS when it answers (no positive cache)', async () => {
    lookupSpy.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    lookupSpy.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    expect((await checkOutboundUrl('https://rotate.net/a', { allowedHosts: null })).ok).toBe(true);
    const second = await checkOutboundUrl('https://rotate.net/b', { allowedHosts: null });
    expect(second).toMatchObject({ ok: false, reason: 'blocked_address' });
    expect(lookupSpy).toHaveBeenCalledTimes(2);
  });

  test('retries one transient EAI_AGAIN before giving up', async () => {
    const transient = Object.assign(new Error('try again'), { code: 'EAI_AGAIN' });
    lookupSpy
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const verdict = await checkOutboundUrl('https://flaky.net/x', { allowedHosts: null });
    expect(verdict.ok).toBe(true);
    expect(lookupSpy).toHaveBeenCalledTimes(2);
  });

  test('transient outage falls back to the last known answer', async () => {
    const transient = Object.assign(new Error('try again'), { code: 'EAI_AGAIN' });
    lookupSpy.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    expect((await checkOutboundUrl('https://steady.net/a', { allowedHosts: null })).ok).toBe(true);

    lookupSpy.mockRejectedValue(transient);
    const verdict = await checkOutboundUrl('https://steady.net/b', { allowedHosts: null });
    expect(verdict).toMatchObject({ ok: true, addresses: ['93.184.216.34'] });
  });

  test('stale fallback still applies the address block', async () => {
    const transient = Object.assign(new Error('try again'), { code: 'EAI_AGAIN' });
    lookupSpy.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    expect((await checkOutboundUrl('https://pivot.net/a', { allowedHosts: null })).reason).toBe('blocked_address');

    lookupSpy.mockRejectedValue(transient);
    const verdict = await checkOutboundUrl('https://pivot.net/b', { allowedHosts: null });
    expect(verdict).toMatchObject({ ok: false, reason: 'blocked_address' });
  });

  test('permanent lookup errors fail closed even with a last known answer', async () => {
    lookupSpy.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    await checkOutboundUrl('https://gone.net/a', { allowedHosts: null });

    lookupSpy.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOTFOUND' }));
    const verdict = await checkOutboundUrl('https://gone.net/b', { allowedHosts: null });
    expect(verdict).toMatchObject({ ok: false, reason: 'dns_resolution_failed' });
  });
});
