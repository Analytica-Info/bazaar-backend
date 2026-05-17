require('../../../setup');
'use strict';

/**
 * grant use-case unit tests.
 */

jest.mock('../../../../src/models/CouponV2');

const mongoose = require('mongoose');
const CouponV2 = require('../../../../src/models/CouponV2');
const { grant } = require('../../../../src/services/coupon/use-cases/grant');

function makeTemplate(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    name: 'Welcome Gift',
    description: 'A welcome present',
    reward: { type: 'flat', amount: 20 },
    rules: [{ type: 'min_subtotal', amount: 50 }],
    max_uses_user: 1,
    priority: 5,
    stack_group: null,
    stackable: false,
    metadata: {},
    status: 'active',
    ...overrides,
  };
}

describe('grant use-case', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws 404 when template not found', async () => {
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await expect(grant({ template_id: 'nonexistent', user_id: 'u1' })).rejects.toThrow('not found');
  });

  it('throws 404 when template is not active', async () => {
    const tpl = makeTemplate({ status: 'paused' });
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tpl) });

    await expect(grant({ template_id: tpl._id, user_id: 'u1' })).rejects.toThrow('not found or not active');
  });

  it('clones template fields correctly into the new coupon', async () => {
    const tpl = makeTemplate();
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tpl) });

    let savedDoc;
    CouponV2.mockImplementation(function (data) {
      savedDoc = data;
      this.save = jest.fn().mockResolvedValue();
      this.toObject = jest.fn().mockReturnValue({ ...data, _id: 'new_id' });
      Object.assign(this, data);
    });

    const { coupon } = await grant({ template_id: tpl._id, user_id: 'u1', granted_by: 'admin' });

    expect(savedDoc.name).toBe(tpl.name);
    expect(savedDoc.description).toBe(tpl.description);
    expect(savedDoc.reward).toEqual(tpl.reward);
    expect(savedDoc.rules).toEqual(tpl.rules);
    expect(savedDoc.priority).toBe(tpl.priority);
    expect(savedDoc.trigger).toBe('code');
    expect(savedDoc.max_uses_total).toBe(1);
    expect(savedDoc.uses_remaining).toBe(1);
    expect(savedDoc.status).toBe('active');
    expect(savedDoc.created_by).toBe('admin');
    expect(savedDoc.metadata.granted_from_template).toBe(tpl._id);
  });

  it('generates a code matching /^grant_.+_[0-9a-f]{24}$/', async () => {
    const tpl = makeTemplate();
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tpl) });

    let savedCode;
    CouponV2.mockImplementation(function (data) {
      savedCode = data.code;
      this.save = jest.fn().mockResolvedValue();
      this.toObject = jest.fn().mockReturnValue({ ...data });
      Object.assign(this, data);
    });

    await grant({ template_id: tpl._id, user_id: 'user42' });
    expect(savedCode).toMatch(/^grant_user42_[0-9a-f]{24}$/);
  });

  it('uses "guest" in code when no user_id', async () => {
    const tpl = makeTemplate();
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tpl) });

    let savedCode;
    CouponV2.mockImplementation(function (data) {
      savedCode = data.code;
      this.save = jest.fn().mockResolvedValue();
      this.toObject = jest.fn().mockReturnValue({ ...data });
      Object.assign(this, data);
    });

    await grant({ template_id: tpl._id });
    expect(savedCode).toMatch(/^grant_guest_[0-9a-f]{24}$/);
  });

  it('returns the same coupon on second call with the same idempotency_key', async () => {
    const existing = { _id: 'existing_id', code: 'grant_u1_abc', status: 'active' };
    CouponV2.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) });
    // findById should NOT be called
    CouponV2.findById = jest.fn();

    const { coupon } = await grant({
      template_id: 'tpl1',
      user_id: 'u1',
      idempotency_key: 'idem-abc-123',
    });

    expect(coupon).toEqual(existing);
    expect(CouponV2.findById).not.toHaveBeenCalled();
  });

  it('sets ends_at to ~30 days from now by default', async () => {
    const tpl = makeTemplate();
    CouponV2.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tpl) });

    let savedData;
    CouponV2.mockImplementation(function (data) {
      savedData = data;
      this.save = jest.fn().mockResolvedValue();
      this.toObject = jest.fn().mockReturnValue({ ...data });
      Object.assign(this, data);
    });

    const before = Date.now();
    await grant({ template_id: tpl._id, user_id: 'u1' });
    const after = Date.now();

    const endsAt = new Date(savedData.ends_at).getTime();
    const expectedMin = before + 29 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 31 * 24 * 60 * 60 * 1000;
    expect(endsAt).toBeGreaterThan(expectedMin);
    expect(endsAt).toBeLessThan(expectedMax);
  });
});
