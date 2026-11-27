'use strict';

const { rewriteHlsPlaylist } = require('../src/services/HlsRewriteService');

function mediaUri(playlist) {
  return playlist.split('\n').find(line => line && !line.startsWith('#'));
}

const playlist = uri => `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${uri}\n`;

test('plain HTTP segments use the HTTPS addon proxy and retain required headers', () => {
  const upstream = 'http://cdn.example/live/segment.ts?token=a%2Bb';
  const output = rewriteHlsPlaylist(playlist(upstream), 'http://cdn.example/live/index.m3u8', {
    absoluteAddonBaseUrl: 'https://sports.example',
    referer: 'https://player.example/watch?id=123',
    origin: 'https://player.example'
  });
  const url = new URL(mediaUri(output));
  expect(url.origin).toBe('https://sports.example');
  expect(url.pathname).toBe('/api/hlschunk');
  expect(url.searchParams.get('url')).toBe(upstream);
  expect(url.searchParams.get('referer')).toBe('https://player.example/watch?id=123');
  expect(url.searchParams.get('origin')).toBe('https://player.example');
});

test('relative HTTP segments resolve against the manifest before being proxied', () => {
  const output = rewriteHlsPlaylist(playlist('../segment.ts'), 'http://cdn.example/live/index.m3u8', {
    absoluteAddonBaseUrl: 'https://sports.example'
  });
  expect(new URL(mediaUri(output)).searchParams.get('url')).toBe('http://cdn.example/segment.ts');
});

test('normal HTTPS segments stay direct and sub-playlists remain manifest requests', () => {
  const opts = { absoluteAddonBaseUrl: 'https://sports.example' };
  const upstream = 'https://cdn.example/segment.ts';
  expect(mediaUri(rewriteHlsPlaylist(playlist(upstream), 'https://cdn.example/index.m3u8', opts))).toBe(upstream);
  const nested = new URL(mediaUri(rewriteHlsPlaylist(playlist('http://cdn.example/low/index.m3u8'), 'https://cdn.example/index.m3u8', opts)));
  expect(nested.pathname).toBe('/api/manifest');
  expect(nested.searchParams.get('url')).toBe('http://cdn.example/low/index.m3u8');
});
