'use strict';

const { buildInventoryReportHtml } = require('../../../../src/services/checkout/templates/inventoryReportHtml');

const BASE_PARAMS = {
    logoUrl: 'https://example.com/logo.png',
    emailDetails: [
        { productName: 'Red Widget', variantId: 'V001', qtySold: 2, qtyRemaining: 8, updateStatus: 'Successful' },
        { productName: 'Blue Gadget', variantId: 'V002', qtySold: 1, qtyRemaining: 0, updateStatus: 'Failed' },
    ],
};

describe('buildInventoryReportHtml', () => {
    it('returns a string', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(typeof html).toBe('string');
    });

    it('contains product names', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('Red Widget');
        expect(html).toContain('Blue Gadget');
    });

    it('contains variant IDs', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('V001');
        expect(html).toContain('V002');
    });

    it('contains update statuses', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('Successful');
        expect(html).toContain('Failed');
    });

    it('contains the logo URL', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('https://example.com/logo.png');
    });

    it('contains the report heading', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('Product Quantity Update Report');
    });

    it('handles empty emailDetails array', () => {
        const html = buildInventoryReportHtml({ ...BASE_PARAMS, emailDetails: [] });
        expect(typeof html).toBe('string');
        expect(html).toContain('Product Quantity Update Report');
    });

    it('renders correct qty values', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toContain('>2<');
        expect(html).toContain('>8<');
    });

    it('snapshot matches stable output', () => {
        const html = buildInventoryReportHtml(BASE_PARAMS);
        expect(html).toMatchSnapshot();
    });
});
