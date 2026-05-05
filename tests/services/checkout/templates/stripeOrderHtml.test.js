'use strict';

const { buildStripeAdminOrderHtml, buildStripeUserOrderHtml } = require('../../../../src/services/checkout/templates/stripeOrderHtml');

const BASE_PARAMS = {
    logoUrl: 'https://example.com/logo.png',
    nextOrderId: 'BZ2026005XYZ',
    orderDateTime: '01 May 2026 - 02:00 pm',
    formattedDeliveryDate: 'Monday, 4 May',
    purchaseDetails: '<tr><td>Gadget</td><td>Blue</td><td>1</td><td>AED 200.00</td></tr>',
    subTotalAmount: '200.00',
    formattedshippingCost: '20.00',
    discountAmount: '0.00',
    totalAmount: '220.00',
    formattedPaymentMethod: 'Stripe',
    name: 'John Smith',
    userEmail: 'john@example.com',
    city: 'Abu Dhabi',
    area: 'Khalidiyah',
    buildingName: 'Palm Building',
    floorNo: '3',
    apartmentNo: '301',
    landmark: 'Near park',
    phone: '+971501112222',
};

describe('buildStripeAdminOrderHtml', () => {
    it('returns a string', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(typeof html).toBe('string');
    });

    it('contains order ID', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('BZ2026005XYZ');
    });

    it('contains customer name', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('John Smith');
    });

    it('contains total amount', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('220.00');
    });

    it('contains payment method', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('Stripe');
    });

    it('contains "To be delivered before" label', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('To be delivered before');
    });

    it('contains "Customer Information" heading', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toContain('Customer Information');
    });

    it('shows fallback "-" for falsy city', () => {
        const html = buildStripeAdminOrderHtml({ ...BASE_PARAMS, city: '' });
        expect(html).toContain('City: -');
    });

    it('snapshot matches stable output', () => {
        const html = buildStripeAdminOrderHtml(BASE_PARAMS);
        expect(html).toMatchSnapshot();
    });
});

describe('buildStripeUserOrderHtml', () => {
    it('returns a string', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(typeof html).toBe('string');
    });

    it('contains order ID', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('BZ2026005XYZ');
    });

    it('contains thank-you greeting', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Thank you for your order');
    });

    it('contains "Get it By" label instead of "To be delivered before"', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Get it By');
        expect(html).not.toContain('To be delivered before');
    });

    it('contains "Billing Details" heading', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(html).toContain('Billing Details');
    });

    it('snapshot matches stable output', () => {
        const html = buildStripeUserOrderHtml(BASE_PARAMS);
        expect(html).toMatchSnapshot();
    });
});
