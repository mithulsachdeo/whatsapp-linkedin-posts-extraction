// Secondary seam: HTTP routes, tested through the route handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';

const ADMIN_TOKEN = 'test-admin-token';

function buildApp() {
  const { db, close } = createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, close };
}

test('GET / renders the no-posts-yet empty state for an anonymous visitor', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts yet/);
    assert.match(res.text, /Last updated: never/);
    assert.doesNotMatch(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET / shows admin-flavoured empty-state copy and nav when the admin token is presented', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, />Import</);
    assert.match(res.text, />Review</);
    assert.match(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET /import is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/import');
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('GET /import succeeds with the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/import').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET /review is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/review');
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('GET /review succeeds with the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/review').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /Review queue/);
  } finally {
    close();
  }
});

test('the design-system stylesheet is served for the layout to link against', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/assets/styles.css');
    assert.equal(res.status, 200);
    assert.match(res.text, /--color-accent/);
  } finally {
    close();
  }
});
