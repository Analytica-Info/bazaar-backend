'use strict';

const { buildTabbyAdminOrderHtml, buildTabbyUserOrderHtml } = require('../../../../src/services/checkout/templates/tabbyOrderHtml');

const BASE_PARAMS = {
    logoUrl: 'https://example.com/logo.png',
    nextOrderId: 'BZ2026001ABC',
    orderDateTime: '01 January 2026 - 10:00 am',
    formattedDeliveryDate: 'Friday, 4 January',
    purchaseDetails: '<tr><td>Widget</td><td>Red</td><td>2</td><td>AED 50.00</td></tr>',
    formattedshippingCost: '15.00',
    formatted_subtotal_amount: '100.00',
    discountAmount: 0,
    formattedDiscountAmount: '0.00',
    formatted_total_amount: '115.00',
    formattedPaymentMethod: 'Tabby',
    name: 'Jane Doe',
    userEmail: 'jane@example.com',
    city: 'Dubai',
    area: 'Downtown',
    buildingName: 'Burj Tower',
    floorNo: '5',
    apartmentNo: '502',
    landmark: 'Near mall',
    phone: '+971501234567',
};

describe('buildTabbyAdminOrderHtml', () => {
    it('returns a string containing the order ID', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(typeof html).toBe('string');
        expect(html).toContain('BZ2026001ABC');
    });

    it('contains customer name', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('Jane Doe');
    });

    it('contains shipping cost', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('15.00');
    });

    it('contains payment method', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('Tabby');
    });

    it('does NOT include discount row when discountAmount is 0', () => {
        const html = buildTabbyAdminOrderHtml({ ...BASE_PARAMS, discountAmount: 0 });
        expect(html).not.toContain('Coupon Discount');
    });

    it('includes discount row when discountAmount > 0', () => {
        const html = buildTabbyAdminOrderHtml({ ...BASE_PARAMS, discountAmount: 10, formattedDiscountAmount: '10.00' });
        expect(html).toContain('Coupon Discount');
        expect(html).toContain('10.00');
    });

    it('shows "-" when optional address fields are falsy', () => {
        const html = buildTabbyAdminOrderHtml({ ...BASE_PARAMS, city: '', area: null, landmark: undefined });
        expect(html).toContain('City: -');
        expect(html).toContain('Area: -');
        expect(html).toContain('Landmark: -');
    });

    it('includes the logo URL', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('https://example.com/logo.png');
    });

    it('contains "Customer Information" heading', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('Customer Information');
    });

    it('contains "To be delivered before" label', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('To be delivered before');
    });

    it('snapshot matches stable output', () => {
        const html = buildTabbyAdminOrderHtml(BASE_PARAMS);
        expect(html).toMatchSnapshot();
    });
});

describe('buildTabbyUserOrderHtml', () => {
    it('returns a string containing the order ID', () => {
        const html = buildTabbyUserOrderHtml(BASE_PARAMS);
        expect(typeof html).toBe('string');
        expect(html).toContain('BZ2026001ABC');
    });

    it('contains thank-you greeting with customer name', () => {
        const html = buildTabbyUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Jane Doe');
        expect(html).toContain('Thank you for your order');
    });

    it('contains "Get it By" label instead of "To be delivered before"', () => {
        const html = buildTabbyUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Get it By');
        expect(html).not.toContain('To be delivered before');
    });

    it('contains "Billing Details" heading', () => {
        const html = buildTabbyUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Billing Details');
    });

    it('does NOT include discount row when discountAmount is 0', () => {
        const html = buildTabbyUserOrderHtml({ ...BASE_PARAMS, discountAmount: 0 });
        expect(html).not.toContain('Coupon Discount');
    });

    it('includes discount row when discountAmount > 0', () => {
        const html = buildTabbyUserOrderHtml({ ...BASE_PARAMS, discountAmount: 5, formattedDiscountAmount: '5.00' });
        expect(html).toContain('Coupon Discount');
    });

    it('snapshot matches stable output', () => {
        const html = buildTabbyUserOrderHtml(BASE_PARAMS);
        expect(html).toMatchSnapshot();
    });
});
