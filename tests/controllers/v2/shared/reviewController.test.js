'use strict';

/**
 * Unit tests for reviewController (v2 shared).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../../src/utilities/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

// Mock the repositories module — rawModel() returns a jest-mock constructor
const mockProductFindOne = jest.fn();
const mockReviewFind = jest.fn();

jest.mock('../../../../src/repositories', () => ({
    products: {
        rawModel: () => ({ findOne: mockProductFindOne }),
    },
    reviews: {
        rawModel: () => ({ find: mockReviewFind }),
    },
}));

jest.mock('../../../../src/services/userService');

const { runHandler } = require('../../../_helpers/handlerExec');
const userService = require('../../../../src/services/userService');
const ctrl = require('../../../../src/controllers/v2/shared/reviewController');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_UUID = 'prod-uuid-001';
const MONGO_PRODUCT = { _id: 'mongo-id-001' };

function makeReq(overrides = {}) {
    return {
        params: { id: PRODUCT_UUID },
        body: {},
        query: {},
        user: null,
        file: null,
        ...overrides,
    };
}

function makeReview(overrides = {}) {
    return {
        _id: 'rev-id-001',
        product_id: 'mongo-id-001',
        user_id: 'user-id-001',
        nickname: 'Alice',
        summary: 'Great product',
        texttext: 'Would buy again',
        image: '',
        quality_rating: 5,
        value_rating: 4,
        price_rating: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _doc: null, // filled below
        ...overrides,
    };
}

// ── GET /v2/products/:id/reviews ──────────────────────────────────────────────

describe('reviewController.getProductReviews', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 with review list for anonymous user', async () => {
        const review = makeReview();
        review._doc = { ...review };
        mockProductFindOne.mockResolvedValue(MONGO_PRODUCT);
        mockReviewFind.mockResolvedValue([review]);

        const { statusCode, body } = await runHandler(
            ctrl.getProductReviews,
            makeReq({ user: null }),
            { path: '/v2/products/prod-uuid-001/reviews' }
        );

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.productId).toBe(PRODUCT_UUID);
        expect(body.data.total).toBe(1);
        expect(body.data.reviews).toHaveLength(1);
        expect(body.data.reviews[0].name).toBe('Alice');
    });

    it('returns 404 when product is not found', async () => {
        mockProductFindOne.mockResolvedValue(null);

        const { statusCode, body } = await runHandler(
            ctrl.getProductReviews,
            makeReq(),
            { path: '/v2/products/bad-id/reviews' }
        );

        expect(statusCode).toBe(404);
        expect(body.success).toBe(false);
    });

    it('returns empty reviews array when no reviews exist', async () => {
        mockProductFindOne.mockResolvedValue(MONGO_PRODUCT);
        mockReviewFind.mockResolvedValue([]);

        const { statusCode, body } = await runHandler(
            ctrl.getProductReviews,
            makeReq(),
            { path: '/v2/products/prod-uuid-001/reviews' }
        );

        expect(statusCode).toBe(200);
        expect(body.data.total).toBe(0);
        expect(body.data.reviews).toEqual([]);
    });
});

// ── GET /v2/products/:id/my-review ────────────────────────────────────────────

describe('reviewController.getMyProductReview', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 with user review when authenticated', async () => {
        const review = makeReview();
        review._doc = { ...review };
        mockProductFindOne.mockResolvedValue(MONGO_PRODUCT);
        mockReviewFind.mockResolvedValue([review]);

        const { statusCode, body } = await runHandler(
            ctrl.getMyProductReview,
            makeReq({ user: { _id: 'user-id-001' } }),
            { path: '/v2/products/prod-uuid-001/my-review' }
        );

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.reviews).toHaveLength(1);
    });

    it('returns 404 when product is not found', async () => {
        mockProductFindOne.mockResolvedValue(null);

        const { statusCode, body } = await runHandler(
            ctrl.getMyProductReview,
            makeReq({ user: { _id: 'user-id-001' } }),
            { path: '/v2/products/bad-id/my-review' }
        );

        expect(statusCode).toBe(404);
    });
});

// ── POST /v2/products/:id/reviews ─────────────────────────────────────────────

describe('reviewController.submitProductReview', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 on successful review submission', async () => {
        const review = makeReview();
        review._doc = { ...review };

        userService.addReview.mockResolvedValue({
            message: 'Review created successfully',
            reviews: [review],
        });

        const { statusCode, body } = await runHandler(
            ctrl.submitProductReview,
            makeReq({
                user: { _id: 'user-id-001' },
                body: {
                    name: 'Alice',
                    description: 'Great',
                    title: 'Love it',
                    quality_rating: 5,
                    value_rating: 4,
                    price_rating: 4,
                },
            }),
            { path: '/v2/products/prod-uuid-001/reviews' }
        );

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Review created successfully');
        expect(body.data.reviews).toHaveLength(1);
    });

    it('forwards product_id from :id path param to userService.addReview', async () => {
        userService.addReview.mockResolvedValue({
            message: 'Review created successfully',
            reviews: [],
        });

        await runHandler(
            ctrl.submitProductReview,
            makeReq({
                params: { id: 'specific-product-id' },
                user: { _id: 'user-id-001' },
                body: { quality_rating: 4 },
            }),
            { path: '/v2/products/specific-product-id/reviews' }
        );

        expect(userService.addReview).toHaveBeenCalledWith(
            'user-id-001',
            expect.objectContaining({ productId: 'specific-product-id' }),
            undefined
        );
    });

    it('returns 400 when no rating fields are provided', async () => {
        const { statusCode, body } = await runHandler(
            ctrl.submitProductReview,
            makeReq({
                user: { _id: 'user-id-001' },
                body: { name: 'Alice' }, // missing all rating fields
            }),
            { path: '/v2/products/prod-uuid-001/reviews' }
        );

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
    });

    it('returns 404 error envelope when service throws { status: 404 }', async () => {
        userService.addReview.mockRejectedValue({ status: 404, message: 'Product not found' });

        const { statusCode, body } = await runHandler(
            ctrl.submitProductReview,
            makeReq({
                user: { _id: 'user-id-001' },
                body: { quality_rating: 4 },
            }),
            { path: '/v2/products/prod-uuid-001/reviews' }
        );

        expect(statusCode).toBe(404);
        expect(body.success).toBe(false);
    });
});
