'use strict';

/**
 * Tests for src/services/order/use-cases/createTabbySession.js
 *
 * The use-case calls Tabby's /api/v2/checkout endpoint with the server-side
 * TABBY_SECRET_KEY. Mobile clients should never hold this key directly
 * (BUG-045 / BUG-058 — security improvement landed in commit 1acb448).
 *
 * These tests mock axios at the module boundary and the User/Order
 * repositories (matching the rest of the test suite's pattern).
 */

jest.mock('axios');
jest.mock('../../../src/repositories', () => ({
  users: { rawModel: jest.fn() },
  orders: { rawModel: jest.fn() },
}));
jest.mock('../../../src/utilities/backendLogger', () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));

const axios = require('axios');
const repos = require('../../../src/repositories');
const createTabbySession = require('../../../src/services/order/use-cases/createTabbySession');

const fakeUser = {
  _id: 'u1',
  email: 'buyer@example.com',
  phone: '0501234567',
  name: 'Test Buyer',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  loyaltyLevel: 0,
  address: [
    { isPrimary: true, city: 'Dubai', area: 'Marina', address: '12 St' },
  ],
};

const SAVED_KEY = process.env.TABBY_SECRET_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TABBY_SECRET_KEY = 'test_tabby_secret_key';
  process.env.TABBY_MERCHANT_CODE = 'BGTAPP';
  // User.findById(...).lean() chain
  const mockUserModel = { findById: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(fakeUser) })) };
  repos.users.rawModel.mockReturnValue(mockUserModel);
  // Order.find(...).sort().limit().lean() chain returns empty by default
  const mockOrderModel = {
    find: jest.fn(() => ({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  };
  repos.orders.rawModel.mockReturnValue(mockOrderModel);
});

afterAll(() => {
  if (SAVED_KEY === undefined) delete process.env.TABBY_SECRET_KEY;
  else process.env.TABBY_SECRET_KEY = SAVED_KEY;
});

const validBody = () => ({
  amount: 250.5,
  currency: 'AED',
  items: [{ id: 'p1', name: 'Mug', qty: 1, price: 250.5 }],
});

// ─── Validation guards ─────────────────────────────────────────────────────

describe('createTabbySession — validation', () => {
  test('throws 401 when userId is missing', async () => {
    await expect(createTabbySession(null, validBody())).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('throws 400 when amount is missing or NaN', async () => {
    await expect(createTabbySession('u1', { items: [{ id: 'p1', name: 'X', qty: 1 }] })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('amount'),
    });
    await expect(createTabbySession('u1', { amount: 'not-a-number', items: [{ id: 'p1', name: 'X', qty: 1 }] })).rejects.toMatchObject({
      status: 400,
    });
  });

  test('throws 400 when items is empty or not an array', async () => {
    await expect(createTabbySession('u1', { amount: 100, items: [] })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('items'),
    });
    await expect(createTabbySession('u1', { amount: 100, items: 'oops' })).rejects.toMatchObject({
      status: 400,
    });
  });

  test('throws 500 when TABBY_SECRET_KEY is not configured', async () => {
    delete process.env.TABBY_SECRET_KEY;
    await expect(createTabbySession('u1', validBody())).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('Tabby is not configured'),
    });
  });

  test('throws 404 when user is not found', async () => {
    const mockUserModel = { findById: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) };
    repos.users.rawModel.mockReturnValue(mockUserModel);
    await expect(createTabbySession('u1', validBody())).rejects.toMatchObject({
      status: 404,
      message: 'User not found',
    });
  });
});

// ─── Tabby happy path ──────────────────────────────────────────────────────

describe('createTabbySession — happy path', () => {
  test('returns paymentId + webUrl on a successful Tabby response', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        payment: { id: 'pay_tabby_123' },
        status: 'created',
        configuration: {
          available_products: {
            installments: [{ web_url: 'https://checkout.tabby.ai/install/abc' }],
          },
        },
      },
    });

    const result = await createTabbySession('u1', validBody());

    expect(result).toEqual({
      paymentId: 'pay_tabby_123',
      status: 'created',
      webUrl: 'https://checkout.tabby.ai/install/abc',
      isRejected: false,
      rejectionReason: null,
    });
  });

  test('passes secret key as Bearer authorization to Tabby', async () => {
    axios.post.mockResolvedValueOnce({ data: {} });
    await createTabbySession('u1', validBody());

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/checkout'),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test_tabby_secret_key',
        }),
      }),
    );
  });

  test('builds a payload with merchant_code, buyer info, and order items', async () => {
    axios.post.mockResolvedValueOnce({ data: {} });
    await createTabbySession('u1', validBody());

    const [, payload] = axios.post.mock.calls[0];
    expect(payload.merchant_code).toBe('BGTAPP');
    expect(payload.payment.amount).toBe('250.50');
    expect(payload.payment.currency).toBe('AED');
    expect(payload.payment.buyer).toMatchObject({
      email: 'buyer@example.com',
      phone: '0501234567',
      name: 'Test Buyer',
    });
    expect(payload.payment.order.items).toHaveLength(1);
    expect(payload.payment.order.items[0]).toMatchObject({
      title: 'Mug',
      quantity: 1,
      unit_price: '250.5',
    });
  });
});

// ─── Tabby rejection path ──────────────────────────────────────────────────

describe('createTabbySession — Tabby rejects', () => {
  test('flags isRejected=true and surfaces rejection reason', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        payment: { id: 'pay_tabby_rej' },
        status: 'rejected',
        configuration: {
          available_products: {
            installments: [],
            installments_rejection_reason: 'not_available',
          },
        },
      },
    });

    const result = await createTabbySession('u1', validBody());

    expect(result.isRejected).toBe(true);
    expect(result.rejectionReason).toBe('not_available');
    expect(result.status).toBe('rejected');
  });
});

// ─── Tabby network / 4xx ───────────────────────────────────────────────────

describe('createTabbySession — Tabby errors', () => {
  test('rethrows Tabby 4xx with the upstream status and message', async () => {
    axios.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: 'invalid_amount' } },
      message: 'Request failed with status 422',
    });

    await expect(createTabbySession('u1', validBody())).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('invalid_amount'),
    });
  });

  test('falls back to 502 on network errors', async () => {
    axios.post.mockRejectedValueOnce({ message: 'ECONNREFUSED' });

    await expect(createTabbySession('u1', validBody())).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('ECONNREFUSED'),
    });
  });
});
