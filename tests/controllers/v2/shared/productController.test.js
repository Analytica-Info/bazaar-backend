'use strict';

/**
 * Unit tests for productController (v2 shared) — searchCategories handler.
 */

jest.mock('../../../../src/services/productService');
jest.mock('../../../../src/utilities/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const productService = require('../../../../src/services/productService');
const { searchCategories } = require('../../../../src/controllers/v2/shared/productController');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
    return {
        query: {},
        body: {},
        user: null,
        ...overrides,
    };
}

const MOCK_CATEGORIES = [
    { id: 'cat-1', name: 'Electronics' },
    { id: 'cat-2', name: 'Electro accessories' },
];

// ── GET /v2/products/categories/search ────────────────────────────────────────

describe('productController.searchCategories', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 400 when q query param is missing', async () => {
        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: {} }),
            { path: '/v2/products/categories/search' }
        );

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when q is an empty string', async () => {
        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: { q: '  ' } }),
            { path: '/v2/products/categories/search' }
        );

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
    });

    it('forwards query to service and maps result to data.categories', async () => {
        productService.getSearchCategories.mockResolvedValue({
            success: true,
            side_bar_categories: MOCK_CATEGORIES,
            search_categoriesList: [],
        });

        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: { q: 'electro' } }),
            { path: '/v2/products/categories/search' }
        );

        expect(productService.getSearchCategories).toHaveBeenCalledWith({ category_name: 'electro' });
        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.categories).toEqual(MOCK_CATEGORIES);
    });

    it('returns 404 when service throws { status: 404 }', async () => {
        productService.getSearchCategories.mockRejectedValue({ status: 404, message: 'No categories found.' });

        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: { q: 'nonexistent' } }),
            { path: '/v2/products/categories/search' }
        );

        expect(statusCode).toBe(404);
        expect(body.success).toBe(false);
    });
});
