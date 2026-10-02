// Secondary seam: the review screen's match/undo actions, tested through the
// HTTP layer per the spec's review-workflow decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { ingest } from '../../src/ingest/ingest.js';

const ADMIN_TOKEN = 'test-admin-token';
const GROUP = 'group-a';
const RAW_SENDER = '+91 90000 00000';
const TEXT = `30/09/26, 10:15 - ${RAW_SENDER}: https://www.linkedin.com/posts/someone_activity-1-abcd`;

function buildApp() {
  const { db, close } = createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, db, close };
}

test('GET /review lists an unknown sender with its share count', async () => {
  const { app, db, close } = buildApp();
  try {
    ingest(db, TEXT, GROUP);

    const res = await request(app).get('/review').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /\+91 90000 00000/);
    assert.match(res.text, /1 share/);
  } finally {
    close();
  }
});

test('GET /review shows the all-clear state when there are no unknown senders', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/review').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /Everyone's accounted for/);
  } finally {
    close();
  }
});

test('POST /review/:id/match is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).post('/review/1/match').type('form').send({ memberId: '1' });
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('POST /review/:id/match with an existing member retroactively re-attributes prior events', async () => {
  const { app, db, close } = buildApp();
  try {
    ingest(db, TEXT, GROUP);
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const reviewItem = db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const res = await request(app)
      .post(`/review/${reviewItem.id}/match`)
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ memberId: String(member.lastInsertRowid) });

    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/review\?/);

    const dashboard = await request(app).get('/').set('x-admin-token', ADMIN_TOKEN);
    assert.match(dashboard.text, /Priya Sharma/);
    assert.doesNotMatch(dashboard.text, /Pending attribution/);

    const row = db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(row.status, 'RESOLVED');

    // Following the redirect renders the toast with its Undo.
    const toastPage = await request(app).get(res.headers.location).set('x-admin-token', ADMIN_TOKEN);
    assert.match(toastPage.text, /is now Priya Sharma/);
    assert.match(toastPage.text, />Undo</);
  } finally {
    close();
  }
});

test('POST /review/:id/match with a new member name creates the member and re-attributes', async () => {
  const { app, db, close } = buildApp();
  try {
    ingest(db, TEXT, GROUP);
    const reviewItem = db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const res = await request(app)
      .post(`/review/${reviewItem.id}/match`)
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ memberId: '', newMemberName: 'Arjun Das' });

    assert.equal(res.status, 302);

    const member = db.prepare('SELECT * FROM members WHERE display_name = ?').get('Arjun Das');
    assert.ok(member);

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Arjun Das/);
  } finally {
    close();
  }
});

test('POST /review/undo reverses a match: the post goes back to Pending attribution and the review item reopens', async () => {
  const { app, db, close } = buildApp();
  try {
    ingest(db, TEXT, GROUP);
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const reviewItem = db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    await request(app)
      .post(`/review/${reviewItem.id}/match`)
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ memberId: String(member.lastInsertRowid) });

    const undoRes = await request(app)
      .post('/review/undo')
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ rawSender: RAW_SENDER });

    assert.equal(undoRes.status, 302);
    assert.equal(undoRes.headers.location, '/review');

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Pending attribution/);
    assert.doesNotMatch(dashboard.text, /Priya Sharma/);

    const row = db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(row.status, 'OPEN');

    const reviewPage = await request(app).get('/review').set('x-admin-token', ADMIN_TOKEN);
    assert.match(reviewPage.text, /\+91 90000 00000/);
  } finally {
    close();
  }
});

test('POST /review/undo for a newly-created member removes that member too', async () => {
  const { app, db, close } = buildApp();
  try {
    ingest(db, TEXT, GROUP);
    const reviewItem = db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const matchRes = await request(app)
      .post(`/review/${reviewItem.id}/match`)
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ memberId: '', newMemberName: 'Arjun Das' });

    const createdMemberId = new URL(matchRes.headers.location, 'http://localhost').searchParams.get(
      'createdMemberId'
    );
    assert.ok(createdMemberId);

    await request(app)
      .post('/review/undo')
      .set('x-admin-token', ADMIN_TOKEN)
      .type('form')
      .send({ rawSender: RAW_SENDER, createdMemberId });

    const member = db.prepare('SELECT * FROM members WHERE display_name = ?').get('Arjun Das');
    assert.equal(member, undefined);
  } finally {
    close();
  }
});
