'use strict';

/**
 * Tests for src/services/order/domain/applyAutoCoupons.js
 *
 * The entire coupon engine is mocked — no DB or network.
 * Follows the AAA pattern used throughout this test suite.
 */

jest.mock('../../../src/services/coupon', () => ({
    evaluateAuto: jest.fn(),
    apply: jest.fn(),
    redeemV2: jest.fn(),
    release: jest.fn(),
}));

jest.mock('../../../src/utilities/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const couponEngine = require('../../../src/services/coupon');
const logger = require('../../../src/utilities/logger');
const { applyAutoCoupons } = require('../../../src/services/order/domain/applyAutoCoupons');

const FAKE_ORDER = { _id: { toString: () => 'order-abc-123' } };
const FAKE_CART = [{ product_id: 'p1', qty: 1, price: 100 }];
const FAKE_USER_ID = 'user-xyz';
const FAKE_PHONE = '+971501234567';

describe('applyAutoCoupons', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns [] when engine returns no winners', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([]);

        // Act
        const result = await applyAutoCoupons({
            order: FAKE_ORDER,
            cart: FAKE_CART,
            user_id: FAKE_USER_ID,
            phone: FAKE_PHONE,
        });

        // Assert
        expect(result).toEqual([]);
        expect(couponEngine.apply).not.toHaveBeenCalled();
    });

    it('calls apply then redeemV2 for each winner and returns results', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'AUTO10' }, discount: 10, verdict: 'eligible' },
            { coupon: { code: 'AUTO5' }, discount: 5, verdict: 'eligible' },
        ]);
        couponEngine.apply
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-1', discount: 10 })
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-2', discount: 5 });
        couponEngine.redeemV2
            .mockResolvedValueOnce({ success: true, redemption: {} })
            .mockResolvedValueOnce({ success: true, redemption: {} });

        // Act
        const result = await applyAutoCoupons({
            order: FAKE_ORDER,
            cart: FAKE_CART,
            user_id: FAKE_USER_ID,
            phone: FAKE_PHONE,
        });

        // Assert
        expect(couponEngine.apply).toHaveBeenCalledTimes(2);
        expect(couponEngine.redeemV2).toHaveBeenCalledTimes(2);
        expect(result).toEqual([
            { redemption_id: 'rid-1', coupon_code: 'AUTO10', discount_aed: 10, status: 'redeemed' },
            { redemption_id: 'rid-2', coupon_code: 'AUTO5', discount_aed: 5, status: 'redeemed' },
        ]);
    });

    it('uses idempotency_key of form order:<id>:<code>', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'MYCODE' }, discount: 20, verdict: 'eligible' },
        ]);
        couponEngine.apply.mockResolvedValue({ success: true, redemption_id: 'rid-3', discount: 20 });
        couponEngine.redeemV2.mockResolvedValue({ success: true, redemption: {} });

        // Act
        await applyAutoCoupons({ order: FAKE_ORDER, cart: FAKE_CART, user_id: FAKE_USER_ID });

        // Assert — idempotency_key is passed through
        expect(couponEngine.apply).toHaveBeenCalledWith(expect.objectContaining({
            idempotency_key: 'order:order-abc-123:MYCODE',
        }));
    });

    it('when apply returns {error}, logs warn and continues to next winner', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'FAIL_APPLY' }, discount: 15, verdict: 'eligible' },
            { coupon: { code: 'PASS' }, discount: 5, verdict: 'eligible' },
        ]);
        couponEngine.apply
            .mockResolvedValueOnce({ error: 'USAGE_LIMIT_REACHED' })
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-4', discount: 5 });
        couponEngine.redeemV2.mockResolvedValue({ success: true, redemption: {} });

        // Act
        const result = await applyAutoCoupons({
            order: FAKE_ORDER,
            cart: FAKE_CART,
            user_id: FAKE_USER_ID,
        });

        // Assert
        expect(logger.warn).toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0].coupon_code).toBe('PASS');
    });

    it('when apply throws, logs warn and continues to next winner', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'BOOM' }, discount: 10, verdict: 'eligible' },
            { coupon: { code: 'OK' }, discount: 3, verdict: 'eligible' },
        ]);
        couponEngine.apply
            .mockRejectedValueOnce(new Error('network error'))
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-5', discount: 3 });
        couponEngine.redeemV2.mockResolvedValue({ success: true, redemption: {} });

        // Act
        const result = await applyAutoCoupons({
            order: FAKE_ORDER,
            cart: FAKE_CART,
            user_id: FAKE_USER_ID,
        });

        // Assert
        expect(logger.warn).toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0].coupon_code).toBe('OK');
    });

    it('when redeem fails, logs warn, calls release, continues', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'CART_CHANGED_CODE' }, discount: 8, verdict: 'eligible' },
            { coupon: { code: 'GOOD' }, discount: 4, verdict: 'eligible' },
        ]);
        couponEngine.apply
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-bad', discount: 8 })
            .mockResolvedValueOnce({ success: true, redemption_id: 'rid-good', discount: 4 });
        couponEngine.redeemV2
            .mockResolvedValueOnce({ success: false, code: 'CART_CHANGED', error: 'cart changed' })
            .mockResolvedValueOnce({ success: true, redemption: {} });
        couponEngine.release.mockResolvedValue({ success: true });

        // Act
        const result = await applyAutoCoupons({
            order: FAKE_ORDER,
            cart: FAKE_CART,
            user_id: FAKE_USER_ID,
        });

        // Assert
        expect(logger.warn).toHaveBeenCalled();
        expect(couponEngine.release).toHaveBeenCalledWith({
            redemption_id: 'rid-bad',
            requesting_user_id: FAKE_USER_ID,
        });
        expect(result).toHaveLength(1);
        expect(result[0].coupon_code).toBe('GOOD');
    });

    it('never throws even when evaluateAuto throws', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockRejectedValue(new Error('engine down'));

        // Act & Assert — must not throw
        await expect(
            applyAutoCoupons({ order: FAKE_ORDER, cart: FAKE_CART, user_id: FAKE_USER_ID })
        ).resolves.toEqual([]);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('never throws even when every call throws', async () => {
        // Arrange
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'CODE1' }, discount: 5, verdict: 'eligible' },
        ]);
        couponEngine.apply.mockRejectedValue(new Error('complete failure'));

        // Act & Assert
        await expect(
            applyAutoCoupons({ order: FAKE_ORDER, cart: FAKE_CART, user_id: FAKE_USER_ID })
        ).resolves.toEqual([]);
    });

    it('re-running with same order._id produces the same idempotency_key (idempotency)', async () => {
        // Arrange — simulate two invocations; second call to apply gets existing reservation back
        const existingRedemptionId = 'rid-idempotent';
        couponEngine.evaluateAuto.mockResolvedValue([
            { coupon: { code: 'IDEM' }, discount: 7, verdict: 'eligible' },
        ]);
        couponEngine.apply
            .mockResolvedValueOnce({ success: true, redemption_id: existingRedemptionId, discount: 7 })
            .mockResolvedValueOnce({ success: true, redemption_id: existingRedemptionId, discount: 7 });
        couponEngine.redeemV2.mockResolvedValue({ success: true, redemption: {} });

        // Act
        const first = await applyAutoCoupons({ order: FAKE_ORDER, cart: FAKE_CART, user_id: FAKE_USER_ID });
        const second = await applyAutoCoupons({ order: FAKE_ORDER, cart: FAKE_CART, user_id: FAKE_USER_ID });

        // Assert — both runs pass the same idempotency_key to apply
        const calls = couponEngine.apply.mock.calls;
        expect(calls[0][0].idempotency_key).toBe(calls[1][0].idempotency_key);
        expect(first[0].redemption_id).toBe(second[0].redemption_id);
    });
});
