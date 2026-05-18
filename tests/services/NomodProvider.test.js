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
            expect(shippingItem.unit_amount).toBe('20.00');
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

        it('truncates item names to 100 chars (Nomod limit)', async () => {
            mockClient.post.mockResolvedValue({
                data: { id: 'chk_trunc', url: 'https://pay.nomod.com/chk_trunc' },
            });

            const longName = 'A'.repeat(250);
            await provider.createCheckout({
                ...checkoutArgs,
                items: [{ name: longName, quantity: 1, price: 100 }],
            });

            const body = mockClient.post.mock.calls[0][1];
            expect(body.items[0].name.length).toBe(100);
            expect(body.items[0].name).toBe('A'.repeat(100));
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

    // ─── 429 retry with exponential backoff ───────────────────────────

    describe('429 retry', () => {
        // Speed up tests: override delay to 0ms during tests
        beforeEach(() => {
            // Patch _getRetryDelayMs to return 0 for tests
            jest.spyOn(provider, '_getRetryDelayMs').mockReturnValue(0);
        });

        it('retries once on 429 and succeeds — exactly 2 underlying axios calls', async () => {
            const successData = { id: 'chk_123', status: 'paid', amount: '150.00', currency: 'AED', charges: [] };
            mockClient.get
                .mockRejectedValueOnce({ response: { status: 429, headers: {} } })
                .mockResolvedValueOnce({ data: successData });

            const result = await provider.getCheckout('chk_123');

            expect(mockClient.get).toHaveBeenCalledTimes(2);
            expect(result.paid).toBe(true);
        });

        it('exhausts 3 attempts on repeated 429 and throws with status 429', async () => {
            const err429 = { response: { status: 429, headers: {} } };
            mockClient.get
                .mockRejectedValueOnce(err429)
                .mockRejectedValueOnce(err429)
                .mockRejectedValueOnce(err429);

            await expect(provider.getCheckout('chk_429')).rejects.toMatchObject({
                status: 429,
            });
            expect(mockClient.get).toHaveBeenCalledTimes(3);
        });

        it('respects Retry-After header value over exponential schedule', async () => {
            const retryAfterSpy = jest.spyOn(provider, '_getRetryDelayMs').mockRestore();
            // Restore real implementation then spy on sleep
            const sleepSpy = jest.spyOn(provider, '_sleep').mockResolvedValue();

            const successData = { id: 'chk_ra', status: 'paid', amount: '50.00', currency: 'AED', charges: [] };
            mockClient.get
                .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '3' } } })
                .mockResolvedValueOnce({ data: successData });

            await provider.getCheckout('chk_ra');

            // Should have slept for 3000ms (from header), not 1000ms (first backoff slot)
            expect(sleepSpy).toHaveBeenCalledWith(3000);
        });

        it('does NOT retry on 400 — throws immediately with 1 axios call', async () => {
            mockClient.get.mockRejectedValueOnce({
                response: { status: 400, data: { message: 'Bad request' } },
            });

            await expect(provider.getCheckout('chk_bad')).rejects.toBeDefined();
            expect(mockClient.get).toHaveBeenCalledTimes(1);
        });

        it('does NOT retry on 5xx — throws immediately (avoid double-processing)', async () => {
            mockClient.get.mockRejectedValueOnce({
                response: { status: 500, data: {} },
            });

            await expect(provider.getCheckout('chk_5xx')).rejects.toBeDefined();
            expect(mockClient.get).toHaveBeenCalledTimes(1);
        });
    });

    // ─── getCheckout — charges array ──────────────────────────────────

    describe('getCheckout charges', () => {
        it('maps charges array from Nomod response', async () => {
            mockClient.get.mockResolvedValue({
                data: {
                    id: 'chk_chg',
                    status: 'paid',
                    amount: '200.00',
                    currency: 'AED',
                    reference_id: 'ref-xyz',
                    charges: [
                        {
                            id: 'chg_001',
                            amount: 200,
                            payment_time: '2026-05-01T10:00:00Z',
                            payment_method: 'card',
                            status: 'paid',
                        },
                    ],
                },
            });

            const result = await provider.getCheckout('chk_chg');

            expect(result.charges).toHaveLength(1);
            expect(result.charges[0]).toMatchObject({
                id: 'chg_001',
                amount: 200,
                paymentTime: '2026-05-01T10:00:00Z',
                paymentMethod: 'card',
                status: 'paid',
            });
            expect(result.reference_id).toBe('ref-xyz');
        });

        it('returns empty charges array when response omits charges field', async () => {
            mockClient.get.mockResolvedValue({
                data: { id: 'chk_nochg', status: 'created', amount: '50.00', currency: 'AED' },
            });

            const result = await provider.getCheckout('chk_nochg');
            expect(result.charges).toEqual([]);
        });

        it('returns empty charges array when charges is not an array (malformed)', async () => {
            mockClient.get.mockResolvedValue({
                data: { id: 'chk_bad', status: 'created', amount: '50.00', currency: 'AED', charges: 'invalid' },
            });

            const result = await provider.getCheckout('chk_bad');
            expect(result.charges).toEqual([]);
        });

        it('does not break existing paid/status fields', async () => {
            mockClient.get.mockResolvedValue({
                data: { id: 'chk_compat', status: 'paid', amount: '75.00', currency: 'AED', charges: [] },
            });

            const result = await provider.getCheckout('chk_compat');
            expect(result.paid).toBe(true);
            expect(result.status).toBe('paid');
        });
    });

    // ─── refundCharge ─────────────────────────────────────────────────

    describe('refundCharge', () => {
        it('happy path: returns { message } from Nomod', async () => {
            mockClient.post.mockResolvedValue({ data: { message: 'Successfully refunded' } });

            const result = await provider.refundCharge('chg_001', { amount: '50.00' });
            expect(result).toMatchObject({ message: 'Successfully refunded' });
            expect(mockClient.post).toHaveBeenCalledWith(
                '/v1/charges/chg_001/refund',
                expect.objectContaining({ amount: '50.00' }),
            );
        });

        it('throws 400 when chargeId is missing', async () => {
            await expect(provider.refundCharge(null, { amount: '50.00' })).rejects.toMatchObject({ status: 400 });
        });

        it('throws 400 when amount is missing', async () => {
            await expect(provider.refundCharge('chg_001', {})).rejects.toMatchObject({ status: 400 });
        });

        it('throws 500 when API key not configured', async () => {
            const savedKey = provider.apiKey;
            provider.apiKey = undefined;
            await expect(provider.refundCharge('chg_001', { amount: '10.00' })).rejects.toMatchObject({ status: 500 });
            provider.apiKey = savedKey;
        });

        it('maps Nomod 404 to 404 error', async () => {
            mockClient.post.mockRejectedValue({ response: { status: 404, data: { message: 'Charge not found' } } });
            await expect(provider.refundCharge('chg_bad', { amount: '10.00' })).rejects.toMatchObject({ status: 404 });
        });

        it('preserves refund_amount_exceeds semantic code in error message', async () => {
            mockClient.post.mockRejectedValue({
                response: {
                    status: 400,
                    data: { message: 'Refund amount exceeds', code: 'refund_amount_exceeds' },
                },
            });

            await expect(provider.refundCharge('chg_001', { amount: '9999.00' }))
                .rejects.toMatchObject({
                    status: 400,
                    message: expect.stringContaining('refund_amount_exceeds'),
                });
        });
    });
});
