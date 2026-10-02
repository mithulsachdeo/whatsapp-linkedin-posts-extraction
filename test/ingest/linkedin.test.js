import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPostUrls, extractLinkedInUrls, classifyLinkedInUrl, canonicalizeUrl } from '../../src/ingest/linkedin.js';

test('extracts /posts/, /feed/update/urn:li:activity:, and /pulse/ URLs', () => {
  const text = [
    'https://www.linkedin.com/posts/someone_activity-1-abcd',
    'https://www.linkedin.com/feed/update/urn:li:activity:7245119038/',
    'https://www.linkedin.com/pulse/some-article-title-someone',
  ].join(' and ');

  const urls = extractPostUrls(text);
  assert.equal(urls.length, 3);
});

test('does not extract profile, company, or job LinkedIn URLs', () => {
  const text = [
    'https://www.linkedin.com/in/someone',
    'https://www.linkedin.com/company/acme',
    'https://www.linkedin.com/jobs/view/12345',
  ].join(' ');

  assert.equal(extractPostUrls(text).length, 0);
});

test('strips trailing sentence punctuation from an extracted URL', () => {
  const urls = extractPostUrls('check this out: https://www.linkedin.com/posts/someone_activity-1-abcd.');
  assert.equal(urls[0], 'https://www.linkedin.com/posts/someone_activity-1-abcd');
});

test('canonicalizeUrl lowercases host, strips tracking params, and drops trailing slash', () => {
  const canonical = canonicalizeUrl(
    'https://www.LinkedIn.com/posts/someone_activity-1-abcd/?utm_source=whatsapp&trackingId=xyz&rcm=abc'
  );
  assert.equal(canonical, 'https://www.linkedin.com/posts/someone_activity-1-abcd');
});

test('canonicalizeUrl returns null for a non-post LinkedIn URL', () => {
  assert.equal(canonicalizeUrl('https://www.linkedin.com/in/someone'), null);
});

test('extractLinkedInUrls also matches lnkd.in short links', () => {
  const urls = extractLinkedInUrls('check this out https://lnkd.in/abc123 and https://example.com/foo');
  assert.deepEqual(urls, ['https://lnkd.in/abc123']);
});

test('classifyLinkedInUrl classifies an lnkd.in URL as SHORT_LINK', () => {
  assert.equal(classifyLinkedInUrl('https://lnkd.in/abc123'), 'SHORT_LINK');
});

test('classifyLinkedInUrl returns null for a non-LinkedIn, non-short-link URL', () => {
  assert.equal(classifyLinkedInUrl('https://example.com/foo'), null);
});
