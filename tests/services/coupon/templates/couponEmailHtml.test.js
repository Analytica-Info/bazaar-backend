'use strict';

const { buildCouponAlertHtml, buildNewCouponHtml } = require('../../../../src/services/coupon/templates/couponEmailHtml');

describe('buildCouponAlertHtml', () => {
    const BASE = {
        logoUrl: 'https://example.com/logo.png',
        totalCouponLimit: 100,
        currentCouponCount: 93,
        remainingCoupons: 7,
    };

    it('returns a string', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(typeof html).toBe('string');
    });

    it('contains the ALERT heading', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(html).toContain('ALERT');
        expect(html).toContain('10 Coupons Remaining');
    });

    it('contains correct coupon counts', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(html).toContain('100');
        expect(html).toContain('93');
        expect(html).toContain('7');
    });

    it('contains logo URL', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(html).toContain('https://example.com/logo.png');
    });

    it('contains the copyright footer', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(html).toContain('bazaar-uae.com');
    });

    it('snapshot matches stable output', () => {
        const html = buildCouponAlertHtml(BASE);
        expect(html).toMatchSnapshot();
    });
});

describe('buildNewCouponHtml', () => {
    const BASE = {
        logoUrl: 'https://example.com/logo.png',
        name: 'Alice',
        phone: '+971501234567',
        couponCode: 'SAVE10ALICE',
    };

    it('returns a string', () => {
        const html = buildNewCouponHtml(BASE);
        expect(typeof html).toBe('string');
    });

    it('contains customer name', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toContain('Alice');
    });

    it('contains phone number', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toContain('+971501234567');
    });

    it('contains coupon code', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toContain('SAVE10ALICE');
    });

    it('contains logo URL', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toContain('https://example.com/logo.png');
    });

    it('contains "Dear Bazaar Team" greeting', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toContain('Dear Bazaar Team');
    });

    it('snapshot matches stable output', () => {
        const html = buildNewCouponHtml(BASE);
        expect(html).toMatchSnapshot();
    });
});
