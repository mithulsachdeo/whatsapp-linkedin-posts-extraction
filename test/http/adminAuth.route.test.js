// Secondary seam: the admin login/logout flow (ticket #10), tested through
// the HTTP layer -- this is the gate every other admin-route test logs in
// through via test/helpers/adminSession.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { loginAsAdmin } from '../helpers/adminSession.js';

const ADMIN_TOKEN = 'test-admin-token';

async function buildApp() {
  const { db, close } = await createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, close, db };
}

test('GET /login renders the password form for an anonymous visitor', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/login');
    assert.equal(res.status, 200);
    assert.match(res.text, /Admin login/);
    assert.match(res.text, /name="password"/);
  } finally {
    await close();
  }
});

test('POST /login with the correct password sets a session cookie and redirects home', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).post('/login').type('form').send({ password: ADMIN_TOKEN });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');
    assert.match(res.headers['set-cookie'][0], /postboard_admin=/);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  } finally {
    await close();
  }
});

test('POST /login with the wrong password re-shows the form with an error and no cookie', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).post('/login').type('form').send({ password: 'nope' });
    assert.equal(res.status, 401);
    assert.match(res.text, /Incorrect password/);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally {
    await close();
  }
});

test('a logged-in admin session persists across requests and unlocks admin-only routes', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/import');
    assert.equal(res.status, 200);
    assert.match(res.text, /Import a chat export/);
  } finally {
    await close();
  }
});

test('POST /login honours a safe `next` redirect back to the page that required login', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ password: ADMIN_TOKEN, next: '/review' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/review');
  } finally {
    await close();
  }
});

test('POST /login rejects an off-site `next` value and falls back to the dashboard', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ password: ADMIN_TOKEN, next: 'https://evil.example/phish' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');
  } finally {
    await close();
  }
});

test('GET /login redirects an already-logged-in admin straight through', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/login');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');
  } finally {
    await close();
  }
});

test('POST /logout clears the session so admin routes require logging in again', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const logoutRes = await agent.post('/logout');
    assert.equal(logoutRes.status, 302);
    assert.equal(logoutRes.headers.location, '/');

    const res = await agent.get('/import');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?next=%2Fimport');
  } finally {
    await close();
  }
});

test('an unauthenticated POST to a mutating admin route gets a clean 401, not a redirect', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).post('/review/1/match').type('form').send({ memberId: '1' });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('with no admin token configured, admin routes are unreachable even with a login attempt', async () => {
  const { db, close } = await createTestDb();
  try {
    const app = createApp(db, {});
    const loginRes = await request(app).post('/login').type('form').send({ password: 'anything' });
    assert.equal(loginRes.status, 401);

    const res = await request(app).get('/import');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?next=%2Fimport');
  } finally {
    await close();
  }
});
