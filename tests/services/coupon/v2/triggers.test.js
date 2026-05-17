require('../../../setup');
'use strict';

/**
 * triggers.js unit tests.
 */

const { TRIGGERS, PUBLIC_TRIGGERS, isAutoTrigger } = require('../../../../src/services/coupon/domain/triggers');

describe('triggers domain module', () => {
  describe('TRIGGERS', () => {
    it('contains all expected trigger values', () => {
      expect(TRIGGERS.CODE).toBe('code');
      expect(TRIGGERS.CART_RENDER).toBe('cart_render');
      expect(TRIGGERS.CHECKOUT_INTENT).toBe('checkout_intent');
      expect(TRIGGERS.SIGNUP).toBe('signup');
      expect(TRIGGERS.SCHEDULED).toBe('scheduled');
      expect(TRIGGERS.MANUAL_GRANT).toBe('manual_grant');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(TRIGGERS)).toBe(true);
    });
  });

  describe('PUBLIC_TRIGGERS', () => {
    it('contains only "code"', () => {
      expect(PUBLIC_TRIGGERS).toEqual(['code']);
      expect(PUBLIC_TRIGGERS.length).toBe(1);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(PUBLIC_TRIGGERS)).toBe(true);
    });
  });

  describe('isAutoTrigger', () => {
    it('returns false for "code"', () => {
      expect(isAutoTrigger('code')).toBe(false);
    });

    it('returns true for "cart_render"', () => {
      expect(isAutoTrigger('cart_render')).toBe(true);
    });

    it('returns true for unknown trigger value', () => {
      expect(isAutoTrigger('unknown_trigger')).toBe(true);
    });

    it('returns true for all non-code triggers', () => {
      const autoTriggers = ['cart_render', 'checkout_intent', 'signup', 'scheduled', 'manual_grant'];
      for (const t of autoTriggers) {
        expect(isAutoTrigger(t)).toBe(true);
      }
    });
  });
});
