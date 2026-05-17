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
const { searchCategories, listCategories } = require('../../../../src/controllers/v2/shared/productController');

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

// ── GET /v2/categories?q=<term> ───────────────────────────────────────────────

describe('productController.searchCategories (deprecated alias)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 400 when q query param is missing', async () => {
        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: {} }),
            { path: '/v2/categories' }
        );

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when q is an empty string', async () => {
        const { statusCode, body } = await runHandler(
            searchCategories,
            makeReq({ query: { q: '  ' } }),
            { path: '/v2/categories' }
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
            { path: '/v2/categories' }
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
            { path: '/v2/categories' }
        );

        expect(statusCode).toBe(404);
        expect(body.success).toBe(false);
    });
});

// ── GET /v2/categories (listCategories unified) ───────────────────────────────

describe('productController.listCategories', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns full category tree when no q param', async () => {
        productService.getCategories.mockResolvedValue({ categories: MOCK_CATEGORIES });

        const { statusCode, body } = await runHandler(
            listCategories,
            makeReq({ query: {} }),
            { path: '/v2/categories' }
        );

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(productService.getCategories).toHaveBeenCalled();
    });

    it('delegates to getSearchCategories when q is provided', async () => {
        productService.getSearchCategories.mockResolvedValue({
            side_bar_categories: MOCK_CATEGORIES,
        });

        const { statusCode, body } = await runHandler(
            listCategories,
            makeReq({ query: { q: 'electro' } }),
            { path: '/v2/categories' }
        );

        expect(statusCode).toBe(200);
        expect(body.data.categories).toEqual(MOCK_CATEGORIES);
        expect(productService.getSearchCategories).toHaveBeenCalledWith({ category_name: 'electro' });
    });
});
