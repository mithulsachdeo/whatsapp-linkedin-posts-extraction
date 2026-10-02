// Unit-level coverage for the session cookie signing/verification primitives
// underneath the login flow (test/http/adminAuth.route.test.js covers the
// HTTP-level behavior built on top of these).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie, clearSessionCookie, isValidSessionCookie, ADMIN_COOKIE_NAME } from '../../src/http/adminAuth.js';

function cookieValue(setCookieHeader) {
  return setCookieHeader.split(';')[0].split('=')[1];
}

test('createSessionCookie produces a value that verifies against the same secret', () => {
  const setCookie = createSessionCookie('s3cret');
  assert.match(setCookie, new RegExp(`^${ADMIN_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  assert.equal(isValidSessionCookie('s3cret', cookieValue(setCookie)), true);
});

test('a session cookie signed with a different secret does not verify', () => {
  const setCookie = createSessionCookie('s3cret');
  assert.equal(isValidSessionCookie('a-different-secret', cookieValue(setCookie)), false);
});

test('a missing, empty, or tampered cookie value does not verify', () => {
  assert.equal(isValidSessionCookie('s3cret', undefined), false);
  assert.equal(isValidSessionCookie('s3cret', ''), false);
  assert.equal(isValidSessionCookie('s3cret', 'admin.not-a-real-signature'), false);
  assert.equal(isValidSessionCookie('s3cret', 'garbage'), false);
});

test('no secret configured means nothing verifies, even a cookie that looks well-formed', () => {
  const setCookie = createSessionCookie('s3cret');
  assert.equal(isValidSessionCookie(undefined, cookieValue(setCookie)), false);
  assert.equal(isValidSessionCookie('', cookieValue(setCookie)), false);
});

test('clearSessionCookie expires the cookie immediately', () => {
  const setCookie = clearSessionCookie();
  assert.match(setCookie, new RegExp(`^${ADMIN_COOKIE_NAME}=;`));
  assert.match(setCookie, /Max-Age=0/);
});
