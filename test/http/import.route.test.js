// Secondary seam: the import upload route, tested through the HTTP layer.
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

test('POST /import is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).post('/import');
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('POST /import with a .txt export shows the traceable stats readout', async () => {
  const { app, close } = buildApp();
  try {
    const text = '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/someone_activity-1-abcd';
    const res = await request(app)
      .post('/import')
      .set('x-admin-token', ADMIN_TOKEN)
      .field('groupId', 'product-chai')
      .attach('file', Buffer.from(text, 'utf8'), 'chat.txt');

    assert.equal(res.status, 200);
    assert.match(res.text, /Import finished/);
    assert.match(res.text, />1<\/div>\s*<div[^>]*>messages read/);
    assert.match(res.text, />1<\/div>\s*<div[^>]*>LinkedIn links found/);
    assert.match(res.text, />1<\/div>\s*<div[^>]*>new posts/);

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Last updated/);
    assert.doesNotMatch(dashboard.text, /Last updated: never/);
  } finally {
    close();
  }
});

test('POST /import without a file shows an error and does not crash', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app)
      .post('/import')
      .set('x-admin-token', ADMIN_TOKEN)
      .field('groupId', 'product-chai');

    assert.equal(res.status, 200);
    assert.match(res.text, /Choose a .txt or .zip chat export/);
  } finally {
    close();
  }
});

test('POST /import without a group shows an error', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app)
      .post('/import')
      .set('x-admin-token', ADMIN_TOKEN)
      .attach('file', Buffer.from('30/09/26, 10:15 - A: hi', 'utf8'), 'chat.txt');

    assert.equal(res.status, 200);
    assert.match(res.text, /Choose which group/);
  } finally {
    close();
  }
});

test('re-uploading a byte-identical file surfaces the duplicate warning', async () => {
  const { app, close } = buildApp();
  try {
    const text = '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/someone_activity-1-abcd';
    await request(app)
      .post('/import')
      .set('x-admin-token', ADMIN_TOKEN)
      .field('groupId', 'product-chai')
      .attach('file', Buffer.from(text, 'utf8'), 'chat.txt');

    const res = await request(app)
      .post('/import')
      .set('x-admin-token', ADMIN_TOKEN)
      .field('groupId', 'product-chai')
      .attach('file', Buffer.from(text, 'utf8'), 'chat.txt');

    assert.match(res.text, /byte-identical/);
  } finally {
    close();
  }
});
