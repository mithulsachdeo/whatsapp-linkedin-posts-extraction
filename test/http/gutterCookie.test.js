// gutters_hidden cookie reader -- client-set (see gutterCookie.js), so only
// a parse helper exists here, same shape as densityCookie.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gutterHiddenFromCookieHeader, GUTTER_COOKIE_NAME } from '../../src/http/gutterCookie.js';

test('gutterHiddenFromCookieHeader is false when the cookie is absent', () => {
  assert.equal(gutterHiddenFromCookieHeader(undefined), false);
  assert.equal(gutterHiddenFromCookieHeader(''), false);
  assert.equal(gutterHiddenFromCookieHeader('other=1'), false);
});

test('gutterHiddenFromCookieHeader is true when the cookie is present among others', () => {
  const header = `postboard_admin=abc.def; ${GUTTER_COOKIE_NAME}=1; layout=cards`;
  assert.equal(gutterHiddenFromCookieHeader(header), true);
});

test('gutterHiddenFromCookieHeader treats any value (even empty) as hidden', () => {
  assert.equal(gutterHiddenFromCookieHeader(`${GUTTER_COOKIE_NAME}=`), true);
});
