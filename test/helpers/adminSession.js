// Shared helper for route tests that need an authenticated admin session
// (ticket #10): logs a supertest agent in via POST /login so its cookie jar
// carries the signed session cookie on every subsequent request.
import request from 'supertest';

/**
 * @param {import('express').Express} app
 * @param {string} password
 * @returns {import('supertest').SuperAgentTest} an agent already logged in as admin
 */
export async function loginAsAdmin(app, password) {
  const agent = request.agent(app);
  const res = await agent.post('/login').type('form').send({ password });
  if (res.status !== 302) {
    throw new Error(`admin login failed in test helper: expected 302, got ${res.status}`);
  }
  return agent;
}
