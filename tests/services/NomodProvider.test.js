process.env.NOMOD_API_KEY = 'test-nomod-key';

const NomodProvider = require('../../src/services/payments/NomodProvider');

// NomodProvider uses axios (via this.client), not global.fetch.
// We mock axios at the module level.
jest.mock('axios', () => {
    const mockAxiosInstance = {
        post: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
    };
    const axios = jest.fn(() => mockAxiosInstance);
    axios.create = jest.fn(() => mockAxiosInstance);
    axios._instance = mockAxiosInstance;
    return axios;
});

const axios = require('axios');
const mockClient = axios._instance;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('NomodProvider', () => {
    let provider;

    beforeEach(() => {
        provider = new NomodProvider();
    });

    // ─── createCheckout ───────────────────────────────────────────────

    describe('createCheckout', () => {
        const checkoutArgs = {
            referenceId: 'ref-001',
            amount: 150.00,
            currency: 'AED',
            discount: 10,
            items: [{ name: 'Widget', quantity: 2, price: 70 }],
            shippingCost: 20,
            customer: { name: 'Ali Hassan', email: 'ali@test.com', phone: '+971501234567' },
            successUrl: 'https://example.com/success',
            failureUrl: 'https://example.com/failure',
            cancelledUrl: 'https://example.com/cancel',
        };

        it('returns id and redirectUrl on success', async () => {
            mockClient.post.mockResolvedValue({
                data: { id: 'chk_123', url: 'https://pay.nomod.com/chk_123', status: 'created' },
            });

            const result = await provider.createCheckout(checkoutArgs);

            expect(result.id).toBe('chk_123');
            expect(result.redirectUrl).toBe('https://pay.nomod.com/chk_123');
            expect(result.raw).toBeDefined();
            expect(mockClient.post).toHaveBeenCalledWith('/v1/checkout', expect.objectContaining({
                reference_id: 'ref-001',
                currency: 'AED',
            }));
        });

        it('includes shipping as a line item when shippingCost > 0', async () => {
            mockClient.post.mockResolvedValue({
                data: { id: 'chk_124', url: 'https://pay.nomod.com/chk_124' },
            });

            await provider.createCheckout(checkoutArgs);

            const body = mockClient.post.mock.calls[0][1];
            const shippingItem = body.items.find(i => i.name === 'Shipping');
            expect(shippingItem).toBeDefined();
            expect(shippingItem.amount).toBe('20.00');
        });

        it('throws structured error on API failure', async () => {
            mockClient.post.mockRejectedValue({
                response: { status: 422, data: { message: 'Invalid amount' } },
            });

            await expect(provider.createCheckout(checkoutArgs)).rejects.toMatchObject({
                status: 422,
                message: 'Invalid amount',
            });
        });

        it('throws 500 when NOMOD_API_KEY is missing', async () => {
            const savedKey = provider.apiKey;
            provider.apiKey = undefined;

            await expect(provider.createCheckout(checkoutArgs)).rejects.toMatchObject({ status: 500 });

            provider.apiKey = savedKey;
        });
    });

    // ─── getCheckout ──────────────────────────────────────────────────

    describe('getCheckout', () => {
        it('returns normalized checkout on success', async () => {
            mockClient.get.mockResolvedValue({
                data: { id: 'chk_123', status: 'paid', amount: '150.00', currency: 'AED' },
            });

            const result = await provider.getCheckout('chk_123');

            expect(result.id).toBe('chk_123');
            expect(result.paid).toBe(true);
            expect(result.status).toBe('paid');
        });

        it('returns paid=false for non-paid status', async () => {
            mockClient.get.mockResolvedValue({
                data: { id: 'chk_125', status: 'created', amount: '50.00', currency: 'AED' },
            });

            const result = await provider.getCheckout('chk_125');
            expect(result.paid).toBe(false);
        });

        it('throws 404 when checkout not found', async () => {
            mockClient.get.mockRejectedValue({ response: { status: 404 } });

            await expect(provider.getCheckout('bad-id')).rejects.toMatchObject({ status: 404 });
        });

        it('throws 500 on generic API error', async () => {
            mockClient.get.mockRejectedValue({ response: { status: 500 } });

            await expect(provider.getCheckout('chk_err')).rejects.toMatchObject({ status: 500 });
        });
    });

    // ─── refund ───────────────────────────────────────────────────────

    describe('refund', () => {
        it('returns refund details on success', async () => {
            mockClient.post.mockResolvedValue({
                data: { refund_id: 'ref_001', status: 'completed', amount: '50.00' },
            });

            const result = await provider.refund('chk_123', { amount: 50, reason: 'Customer return' });

            expect(result.refundId).toBe('ref_001');
            expect(result.status).toBe('completed');
        });

        it('throws 400 when amount is missing', async () => {
            await expect(provider.refund('chk_123', {})).rejects.toMatchObject({ status: 400 });
        });

        it('throws structured error on API failure', async () => {
            mockClient.post.mockRejectedValue({
                response: { status: 400, data: { message: 'Already refunded' } },
            });

            await expect(provider.refund('chk_123', { amount: 50 })).rejects.toMatchObject({
                status: 400,
                message: 'Already refunded',
            });
        });
    });

    // ─── cancelCheckout ───────────────────────────────────────────────

    describe('cancelCheckout', () => {
        it('resolves without error on success', async () => {
            mockClient.delete.mockResolvedValue({});
            await expect(provider.cancelCheckout('chk_123')).resolves.toBeUndefined();
        });

        it('throws 404 when checkout not found', async () => {
            mockClient.delete.mockRejectedValue({ response: { status: 404 } });

            await expect(provider.cancelCheckout('bad-id')).rejects.toMatchObject({ status: 404 });
        });

        it('throws the upstream status on generic error', async () => {
            mockClient.delete.mockRejectedValue({ response: { status: 503 } });

            await expect(provider.cancelCheckout('chk_123')).rejects.toMatchObject({ status: 503 });
        });
    });

    // ─── handleWebhook ────────────────────────────────────────────────

    describe('handleWebhook', () => {
        it('returns unknown stub shape', async () => {
            const result = await provider.handleWebhook({ event: 'something' }, {});
            expect(result).toMatchObject({ event: 'unknown', sessionId: null, status: null });
        });
    });
});
