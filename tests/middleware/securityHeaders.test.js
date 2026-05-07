'use strict';

const express = require('express');
const request = require('supertest');
const securityHeaders = require('../../src/middleware/securityHeaders');

function buildApp() {
  const app = express();
  app.use(securityHeaders);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('securityHeaders middleware', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/test');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await request(app).get('/test');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-XSS-Protection: 0', async () => {
    const res = await request(app).get('/test');
    // Modern best practice: 0 disables legacy XSS auditor (use CSP instead)
    expect(res.headers['x-xss-protection']).toBe('0');
  });

  it('does NOT set CSP header (CSP is off per spec)', async () => {
    const res = await request(app).get('/test');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('calls next so subsequent middleware runs', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sets Strict-Transport-Security in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prodApp = buildApp();
    const res = await request(prodApp).get('/test');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    process.env.NODE_ENV = original;
  });
});
