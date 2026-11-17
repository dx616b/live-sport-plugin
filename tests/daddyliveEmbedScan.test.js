'use strict';

const { findPlayerPhpRef, findPlayerPhpCall } = require('../src/providers/DaddyLiveProvider');

const oldRef = (h) => { const m = h.match(/([^"']*player\.php)/i); return m ? m[1] : null; };
const oldCall = (h) => { const m = h.match(/([^"'\s]*player\.php\?[^"'\s]*[?&]id=\d+[^"'\s]*)/i); return m ? m[1] : null; };

function quoteFreeArray(n) {
  return '[' + Array.from({ length: n }, (_, i) => i % 251).join(',') + ']';
}

describe('DaddyLive embed scan helpers', () => {
  const cases = [
    ['template', '<script>var u="api/player.php?id="+safeId;</script>'],
    ['concrete with first query', 'x.fetch("https://site.tld/api/player.php?id=91&a=1")'],
    ['concrete single quotes', "iframe.src='//cdn.tld/api/player.php?id=44&t=1'"],
    ['no reference', '<html><script>var a=[1,2,3];</script></html>'],
    ['reference without id', '<a href="/x/player.php">go</a>'],
    ['two calls', 'a("player.php?id=7") b("player.php?id=8")'],
    ['escaped slashes', 'x="api\\/player.php?id=5"'],
    ['second-param id', 'f("player.php?x=1&id=5")'],
  ];

  test.each(cases)('matches the historical regex output: %s', (_name, html) => {
    expect(findPlayerPhpRef(html)).toBe(oldRef(html));
    expect(findPlayerPhpCall(html)).toBe(oldCall(html));
  });

  test('stays linear on a multi-megabyte quote-free payload', () => {
    const html = `<html><script>var d=${quoteFreeArray(350000)};</script>` +
      '<script>fetch("api/player.php?id=12&z=1")</script></html>';
    const started = Date.now();
    expect(findPlayerPhpRef(html)).toBe('api/player.php');
    expect(findPlayerPhpCall(html)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('returns null quickly when the payload has no reference at all', () => {
    const html = `<html><script>var d=${quoteFreeArray(350000)};</script></html>`;
    const started = Date.now();
    expect(findPlayerPhpRef(html)).toBeNull();
    expect(findPlayerPhpCall(html)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});
