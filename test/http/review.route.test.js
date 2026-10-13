// Secondary seam: the review screen's match/undo actions, tested through the
// HTTP layer per the spec's review-workflow decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { ingest } from '../../src/ingest/ingest.js';
import { loginAsAdmin } from '../helpers/adminSession.js';

const ADMIN_TOKEN = 'test-admin-token';
const GROUP = 'group-a';
const RAW_SENDER = '+91 90000 00000';
const TEXT = `30/09/26, 10:15 - ${RAW_SENDER}: https://www.linkedin.com/posts/someone_activity-1-abcd`;
const OTHER_LINKEDIN_TEXT = `30/09/26, 10:15 - ${RAW_SENDER}: https://www.linkedin.com/in/priya-sharma`;

async function buildApp() {
  const { db, close } = await createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, db, close };
}

test('GET /review lists an unknown sender with its share count', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, TEXT, GROUP);

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/review');
    assert.equal(res.status, 200);
    assert.match(res.text, /\+91 90000 00000/);
    assert.match(res.text, /1 share/);
  } finally {
    await close();
  }
});

test('GET /review shows the all-clear state when there are no unknown senders', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/review');
    assert.equal(res.status, 200);
    assert.match(res.text, /Everyone's accounted for/);
  } finally {
    await close();
  }
});

test('POST /review/:id/match is unauthorized without a logged-in admin session', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).post('/review/1/match').type('form').send({ memberId: '1' });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('POST /review/:id/match with an existing member retroactively re-attributes prior events', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, TEXT, GROUP);
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent
      .post(`/review/${reviewItem.id}/match`)
      .type('form')
      .send({ memberId: String(member.lastInsertRowid) });

    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/review\?/);

    const dashboard = await agent.get('/');
    assert.match(dashboard.text, /Priya Sharma/);
    assert.doesNotMatch(dashboard.text, /Pending attribution/);

    const row = await db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(row.status, 'RESOLVED');

    // Following the redirect renders the toast with its Undo.
    const toastPage = await agent.get(res.headers.location);
    assert.match(toastPage.text, /is now Priya Sharma/);
    assert.match(toastPage.text, />Undo</);
  } finally {
    await close();
  }
});

test('POST /review/:id/match with a new member name creates the member and re-attributes', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, TEXT, GROUP);
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent
      .post(`/review/${reviewItem.id}/match`)
      .type('form')
      .send({ memberId: '', newMemberName: 'Arjun Das' });

    assert.equal(res.status, 302);

    const member = await db.prepare('SELECT * FROM members WHERE display_name = ?').get('Arjun Das');
    assert.ok(member);

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Arjun Das/);
  } finally {
    await close();
  }
});

test('POST /review/undo reverses a match: the post goes back to Pending attribution and the review item reopens', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, TEXT, GROUP);
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    await agent
      .post(`/review/${reviewItem.id}/match`)
      .type('form')
      .send({ memberId: String(member.lastInsertRowid) });

    const undoRes = await agent.post('/review/undo').type('form').send({ rawSender: RAW_SENDER });

    assert.equal(undoRes.status, 302);
    assert.equal(undoRes.headers.location, '/review');

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Pending attribution/);
    assert.doesNotMatch(dashboard.text, /Priya Sharma/);

    const row = await db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(row.status, 'OPEN');

    const reviewPage = await agent.get('/review');
    assert.match(reviewPage.text, /\+91 90000 00000/);
  } finally {
    await close();
  }
});

test('POST /review/undo for a newly-created member removes that member too', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, TEXT, GROUP);
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const matchRes = await agent
      .post(`/review/${reviewItem.id}/match`)
      .type('form')
      .send({ memberId: '', newMemberName: 'Arjun Das' });

    const createdMemberId = new URL(matchRes.headers.location, 'http://localhost').searchParams.get(
      'createdMemberId'
    );
    assert.ok(createdMemberId);

    await agent.post('/review/undo').type('form').send({ rawSender: RAW_SENDER, createdMemberId });

    const member = await db.prepare('SELECT * FROM members WHERE display_name = ?').get('Arjun Das');
    assert.equal(member, undefined);
  } finally {
    await close();
  }
});

test('GET /review lists a non-post LinkedIn link under "Non-post LinkedIn links"', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, OTHER_LINKEDIN_TEXT, GROUP);

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/review');
    assert.equal(res.status, 200);
    assert.match(res.text, /https:\/\/www\.linkedin\.com\/in\/priya-sharma/);
    assert.match(res.text, /Non-post LinkedIn links/);
  } finally {
    await close();
  }
});

test('POST /review/other/:id/dismiss is unauthorized without a logged-in admin session', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).post('/review/other/1/dismiss');
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('POST /review/other/:id/dismiss confirms the link is not a post and shows an undoable toast', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, OTHER_LINKEDIN_TEXT, GROUP);
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'OTHER_LINKEDIN'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.post(`/review/other/${reviewItem.id}/dismiss`);
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/review\?/);

    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(reviewItem.id);
    assert.equal(row.status, 'DISMISSED');

    const reviewPage = await agent.get(res.headers.location);
    assert.match(reviewPage.text, /dismissed as not a post/);
    assert.match(reviewPage.text, /No non-post links to review/);
  } finally {
    await close();
  }
});

test('POST /review/other/:id/promote reclassifies the link as a post on the dashboard', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, OTHER_LINKEDIN_TEXT, GROUP);
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'OTHER_LINKEDIN'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.post(`/review/other/${reviewItem.id}/promote`);
    assert.equal(res.status, 302);

    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(reviewItem.id);
    assert.equal(row.status, 'RESOLVED');

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /priya-sharma/);

    const toastPage = await agent.get(res.headers.location);
    assert.match(toastPage.text, /is now on the board as a post/);
  } finally {
    await close();
  }
});

test('POST /review/other/:id/undo reverses a dismiss or promote and reopens the item', async () => {
  const { app, db, close } = await buildApp();
  try {
    await ingest(db, OTHER_LINKEDIN_TEXT, GROUP);
    const reviewItem = await db.prepare("SELECT id FROM review_items WHERE kind = 'OTHER_LINKEDIN'").get();

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    await agent.post(`/review/other/${reviewItem.id}/dismiss`);

    const undoRes = await agent.post(`/review/other/${reviewItem.id}/undo`);
    assert.equal(undoRes.status, 302);
    assert.equal(undoRes.headers.location, '/review');

    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(reviewItem.id);
    assert.equal(row.status, 'OPEN');

    const reviewPage = await agent.get('/review');
    assert.match(reviewPage.text, /priya-sharma/);
  } finally {
    await close();
  }
});
