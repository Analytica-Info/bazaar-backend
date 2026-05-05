'use strict';

const {
    buildAdminOrderEmailHtml,
    buildUserOrderEmailHtml,
    buildWebhookAdminEmailHtml,
    buildWebhookUserEmailHtml,
} = require('../../../../src/services/order/domain/emailTemplates');

const BASE = {
    logoUrl: 'https://example.com/logo.png',
    nextOrderId: 'BZ2026010ZZZ',
    orderDateTime: '10 May 2026 - 11:00 am',
    formattedDeliveryDate: 'Thursday, 13 May',
    purchaseDetails: '<tr><td>Mug</td><td>White</td><td>3</td><td>AED 30.00</td></tr>',
    amount_subtotal: '90.00',
    formattedshippingCost: '10.00',
    discount_amount_long: 0,
    discount_amount: '0.00',
    total: 100,
    name: 'Bob Builder',
    userEmail: 'bob@example.com',
    address: '123 Main St',
    city: 'Sharjah',
    area: 'Al Majaz',
    buildingName: 'Tower A',
    floorNo: '2',
    apartmentNo: '201',
    landmark: null,
    phone: '+971509876543',
};

const WEBHOOK_BASE = {
    logoUrl: BASE.logoUrl,
    nextOrderId: BASE.nextOrderId,
    orderDateTime: BASE.orderDateTime,
    formattedDeliveryDate: BASE.formattedDeliveryDate,
    purchaseDetails: BASE.purchaseDetails,
    formattedshippingCost: BASE.formattedshippingCost,
    formatted_subtotal_amount: BASE.amount_subtotal,
    discount_amount_long: 0,
    discount_amount: '0.00',
    amount_total: '100.00',
    orderData: {
        name: BASE.name,
        user_email: BASE.userEmail,
        address: BASE.address,
        city: BASE.city,
        area: BASE.area,
        buildingName: BASE.buildingName,
        floorNo: BASE.floorNo,
        apartmentNo: BASE.apartmentNo,
        landmark: null,
        phone: BASE.phone,
    },
};

describe('buildAdminOrderEmailHtml', () => {
    it('returns a string containing the order ID', () => {
        const html = buildAdminOrderEmailHtml(BASE);
        expect(typeof html).toBe('string');
        expect(html).toContain('BZ2026010ZZZ');
    });

    it('contains customer name', () => {
        const html = buildAdminOrderEmailHtml(BASE);
        expect(html).toContain('Bob Builder');
    });

    it('formats total with toFixed(2)', () => {
        const html = buildAdminOrderEmailHtml(BASE);
        expect(html).toContain('100.00');
    });

    it('omits discount row when discount_amount_long is 0', () => {
        const html = buildAdminOrderEmailHtml(BASE);
        expect(html).not.toContain('Coupon Discount');
    });

    it('includes discount row when discount_amount_long > 0', () => {
        const html = buildAdminOrderEmailHtml({ ...BASE, discount_amount_long: 10, discount_amount: '10.00' });
        expect(html).toContain('Coupon Discount');
    });

    it('renders landmark as "-" when null', () => {
        const html = buildAdminOrderEmailHtml({ ...BASE, landmark: null });
        expect(html).toContain('Landmark: -');
    });

    it('snapshot matches stable output', () => {
        const html = buildAdminOrderEmailHtml(BASE);
        expect(html).toMatchSnapshot();
    });
});

describe('buildUserOrderEmailHtml', () => {
    it('contains "Get it By" label', () => {
        const html = buildUserOrderEmailHtml(BASE);
        expect(html).toContain('Get it By');
    });

    it('contains "Billing Details" heading', () => {
        const html = buildUserOrderEmailHtml(BASE);
        expect(html).toContain('Billing Details');
    });

    it('contains customer name in greeting', () => {
        const html = buildUserOrderEmailHtml(BASE);
        expect(html).toContain('Bob Builder');
        expect(html).toContain('Thank you for your order');
    });

    it('snapshot matches stable output', () => {
        const html = buildUserOrderEmailHtml(BASE);
        expect(html).toMatchSnapshot();
    });
});

describe('buildWebhookAdminEmailHtml', () => {
    it('contains order ID', () => {
        const html = buildWebhookAdminEmailHtml(WEBHOOK_BASE);
        expect(html).toContain('BZ2026010ZZZ');
    });

    it('contains customer name from orderData', () => {
        const html = buildWebhookAdminEmailHtml(WEBHOOK_BASE);
        expect(html).toContain('Bob Builder');
    });

    it('omits discount row when discount_amount_long is 0', () => {
        const html = buildWebhookAdminEmailHtml(WEBHOOK_BASE);
        expect(html).not.toContain('Coupon Discount');
    });

    it('includes discount row when discount_amount_long > 0', () => {
        const html = buildWebhookAdminEmailHtml({ ...WEBHOOK_BASE, discount_amount_long: 5, discount_amount: '5.00' });
        expect(html).toContain('Coupon Discount');
    });

    it('snapshot matches stable output', () => {
        const html = buildWebhookAdminEmailHtml(WEBHOOK_BASE);
        expect(html).toMatchSnapshot();
    });
});

describe('buildWebhookUserEmailHtml', () => {
    it('contains "Get it By" label', () => {
        const html = buildWebhookUserEmailHtml(WEBHOOK_BASE);
        expect(html).toContain('Get it By');
    });

    it('contains customer name in greeting', () => {
        const html = buildWebhookUserEmailHtml(WEBHOOK_BASE);
        expect(html).toContain('Bob Builder');
        expect(html).toContain('Thank you for your order');
    });

    it('snapshot matches stable output', () => {
        const html = buildWebhookUserEmailHtml(WEBHOOK_BASE);
        expect(html).toMatchSnapshot();
    });
});
