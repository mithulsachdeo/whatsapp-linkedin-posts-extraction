// Verifies the Vercel serverless entry (api/index.js) wires up the real app
// against an in-memory DB and serves, without going through the Vercel runtime.
// NODE_ENV=test makes resolveDbConfig() pick :memory:.
process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import gatingApp, { getApp } from '../../api/index.js';

test('vercel entry builds the app and serves the dashboard (200)', async () => {
  const app = await getApp();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Rethinkers/);
});

test('vercel entry serves the login page (200)', async () => {
  const app = await getApp();
  const res = await request(app).get('/login');
  assert.equal(res.status, 200);
});

test('vercel entry serves a static asset from /assets', async () => {
  const app = await getApp();
  const res = await request(app).get('/assets/styles.css');
  assert.equal(res.status, 200);
});

test('default export (the gating app Vercel invokes) delegates and serves', async () => {
  // This is what Vercel actually runs: the exported Express app that lazily
  // builds the real app and delegates. Exercise it directly.
  const res = await request(gatingApp).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Rethinkers/);
});
