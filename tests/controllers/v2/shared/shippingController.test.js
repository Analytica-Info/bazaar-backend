'use strict';

jest.mock('../../../../src/services/shippingService');
jest.mock('../../../../src/middleware', () => ({
  asyncHandler: (fn) => fn,
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const shippingService = require('../../../../src/services/shippingService');
const ctrl = require('../../../../src/controllers/v2/shared/shippingController');

const PATH = '/v2/shipping';

beforeEach(() => jest.clearAllMocks());

// ── getCountries ────────────────────────────────────────────────────────────

describe('getCountries', () => {
  it('returns 200 with data.countries on success', async () => {
    const countries = [{ code: 'AE', name: 'UAE' }, { code: 'SA', name: 'Saudi Arabia' }];
    shippingService.listActiveCountries.mockResolvedValue(countries);

    const { statusCode, body } = await runHandler(
      ctrl.getCountries,
      { query: {} },
      { path: `${PATH}/countries` }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.countries).toEqual(countries);
    expect(shippingService.listActiveCountries).toHaveBeenCalledTimes(1);
  });

  it('propagates service errors via errorHandler', async () => {
    shippingService.listActiveCountries.mockRejectedValue(
      Object.assign(new Error('DB down'), { status: 500 })
    );

    const { statusCode, body } = await runHandler(
      ctrl.getCountries,
      { query: {} },
      { path: `${PATH}/countries` }
    );

    expect(statusCode).toBeGreaterThanOrEqual(500);
    expect(body.success).toBe(false);
  });
});

// ── getCountryCities ────────────────────────────────────────────────────────

describe('getCountryCities', () => {
  it('returns 200 with data.cities and data.country', async () => {
    const serviceResult = {
      country: 'UAE',
      code: 'AE',
      cities: [{ _id: '1', name: 'Dubai', areas: [] }],
    };
    shippingService.getCitiesForCountry.mockResolvedValue(serviceResult);

    const { statusCode, body } = await runHandler(
      ctrl.getCountryCities,
      { params: { code: 'AE' }, query: {} },
      { path: `${PATH}/countries/AE/cities` }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.cities).toEqual(serviceResult.cities);
    expect(body.data.country).toBe('UAE');
    expect(shippingService.getCitiesForCountry).toHaveBeenCalledWith('AE');
  });

  it('forwards the :code param to the service', async () => {
    shippingService.getCitiesForCountry.mockResolvedValue({ country: 'Saudi Arabia', code: 'SA', cities: [] });

    await runHandler(
      ctrl.getCountryCities,
      { params: { code: 'SA' }, query: {} },
      { path: `${PATH}/countries/SA/cities` }
    );

    expect(shippingService.getCitiesForCountry).toHaveBeenCalledWith('SA');
  });

  it('returns 404 envelope when service throws {status: 404}', async () => {
    shippingService.getCitiesForCountry.mockRejectedValue(
      Object.assign(new Error("Country 'XX' not found or not active."), { status: 404 })
    );

    const { statusCode, body } = await runHandler(
      ctrl.getCountryCities,
      { params: { code: 'XX' }, query: {} },
      { path: `${PATH}/countries/XX/cities` }
    );

    expect(statusCode).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ── getQuote (was getCost) ───────────────────────────────────────────────────

describe('getQuote', () => {
  const serviceResult = {
    shippingCost: 25,
    currency: 'AED',
    currencySymbol: 'د.إ',
    countryName: 'UAE',
    freeShipping: false,
    freeShippingThreshold: 200,
  };

  it('returns 200 with data.cost and related fields', async () => {
    shippingService.calculateShippingCost.mockResolvedValue(serviceResult);

    const { statusCode, body } = await runHandler(
      ctrl.getQuote,
      { query: { country: 'AE', city: 'Dubai', area: 'JBR', subtotal: '150' } },
      { path: `${PATH}/quote` }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.cost).toBe(25);
    expect(body.data.currency).toBe('AED');
    expect(body.data.freeShipping).toBe(false);
  });

  it('forwards query params to service', async () => {
    shippingService.calculateShippingCost.mockResolvedValue(serviceResult);

    await runHandler(
      ctrl.getQuote,
      { query: { country: 'AE', city: 'Dubai', area: 'JBR', subtotal: '150' } },
      { path: `${PATH}/quote` }
    );

    expect(shippingService.calculateShippingCost).toHaveBeenCalledWith('AE', 'Dubai', 'JBR', 150);
  });

  it('passes null subtotal when not provided', async () => {
    shippingService.calculateShippingCost.mockResolvedValue({ ...serviceResult, freeShipping: false });

    await runHandler(
      ctrl.getQuote,
      { query: { country: 'AE' } },
      { path: `${PATH}/quote` }
    );

    expect(shippingService.calculateShippingCost).toHaveBeenCalledWith('AE', undefined, undefined, null);
  });

  it('returns free-shipping response when threshold met', async () => {
    shippingService.calculateShippingCost.mockResolvedValue({
      ...serviceResult,
      shippingCost: 0,
      freeShipping: true,
    });

    const { body } = await runHandler(
      ctrl.getQuote,
      { query: { country: 'AE', subtotal: '300' } },
      { path: `${PATH}/quote` }
    );

    expect(body.data.cost).toBe(0);
    expect(body.data.freeShipping).toBe(true);
  });

  it('returns error envelope when service throws {status: 400}', async () => {
    shippingService.calculateShippingCost.mockRejectedValue(
      Object.assign(new Error("Shipping is not available to country 'ZZ'."), { status: 400 })
    );

    const { statusCode, body } = await runHandler(
      ctrl.getQuote,
      { query: { country: 'ZZ' } },
      { path: `${PATH}/quote` }
    );

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
  });
});
