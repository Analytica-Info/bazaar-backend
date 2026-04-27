jest.mock("../../src/services/productSyncService");
jest.mock("../../src/utilities/logger", () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

const productSyncService = require("../../src/services/productSyncService");
const webhookController = require("../../src/controllers/ecommerce/webhookController");

const makeReq = (body = {}) => ({ body });
const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

// Helper: wait for all pending microtasks / setImmediate so async background
// processing has a chance to run (or throw) before we assert on it.
const flushAsync = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// productUpdate
// ---------------------------------------------------------------------------
describe("webhookController.productUpdate", () => {
    it("responds 200 immediately before processing completes", async () => {
        // Service resolves slowly — but controller must have already sent 200
        productSyncService.handleProductUpdate.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const req = makeReq({ payload: '{"id":"p1"}', type: "product.update" });
        const res = makeRes();

        await webhookController.productUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({ success: true });
    });

    it("responds 200 even when background processing throws", async () => {
        productSyncService.handleProductUpdate.mockRejectedValue(new Error("boom"));

        const req = makeReq({ payload: '{"id":"p1"}', type: "product.update" });
        const res = makeRes();

        await webhookController.productUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({ success: true });
    });

    it("passes payload and type to handleProductUpdate", async () => {
        productSyncService.handleProductUpdate.mockResolvedValue({ success: true });

        const req = makeReq({ payload: '{"id":"p1"}', type: "product.update" });
        const res = makeRes();

        await webhookController.productUpdate(req, res);
        await flushAsync();

        expect(productSyncService.handleProductUpdate).toHaveBeenCalledWith({
            payload: '{"id":"p1"}',
            type: "product.update",
        });
    });

    it("responds 200 when payload and type are both missing (error handled async)", async () => {
        productSyncService.handleProductUpdate.mockRejectedValue({ status: 400, message: "No payload" });

        const req = makeReq({});
        const res = makeRes();

        await webhookController.productUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ---------------------------------------------------------------------------
// inventoryUpdate
// ---------------------------------------------------------------------------
describe("webhookController.inventoryUpdate", () => {
    it("responds 200 immediately before processing completes", async () => {
        productSyncService.handleInventoryUpdate.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const req = makeReq({ payload: '{"id":"i1","product":{"id":"p1"}}', type: "inventory.update" });
        const res = makeRes();

        await webhookController.inventoryUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({ success: true });
    });

    it("responds 200 even when background processing throws", async () => {
        productSyncService.handleInventoryUpdate.mockRejectedValue(new Error("inventory error"));

        const req = makeReq({ payload: '{"id":"i1","product":{"id":"p1"}}', type: "inventory.update" });
        const res = makeRes();

        await webhookController.inventoryUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("passes payload and type to handleInventoryUpdate", async () => {
        productSyncService.handleInventoryUpdate.mockResolvedValue({ success: true });

        const req = makeReq({ payload: '{"id":"i2"}', type: "inventory.update" });
        const res = makeRes();

        await webhookController.inventoryUpdate(req, res);
        await flushAsync();

        expect(productSyncService.handleInventoryUpdate).toHaveBeenCalledWith({
            payload: '{"id":"i2"}',
            type: "inventory.update",
        });
    });

    it("responds 200 when payload is missing (error handled async)", async () => {
        productSyncService.handleInventoryUpdate.mockRejectedValue({ status: 400, message: "No payload" });

        const req = makeReq({});
        const res = makeRes();

        await webhookController.inventoryUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ---------------------------------------------------------------------------
// saleUpdate
// ---------------------------------------------------------------------------
describe("webhookController.saleUpdate", () => {
    it("responds 200 immediately before processing completes", async () => {
        productSyncService.handleSaleUpdate.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const req = makeReq({ payload: '{"id":"s1"}', type: "register_sale.update" });
        const res = makeRes();

        await webhookController.saleUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({ success: true });
    });

    it("responds 200 even when background processing throws", async () => {
        productSyncService.handleSaleUpdate.mockRejectedValue(new Error("sale error"));

        const req = makeReq({ payload: '{"id":"s1"}', type: "register_sale.update" });
        const res = makeRes();

        await webhookController.saleUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("passes payload and type to handleSaleUpdate", async () => {
        productSyncService.handleSaleUpdate.mockResolvedValue({ success: true });

        const req = makeReq({ payload: '{"id":"s2"}', type: "register_sale.save" });
        const res = makeRes();

        await webhookController.saleUpdate(req, res);
        await flushAsync();

        expect(productSyncService.handleSaleUpdate).toHaveBeenCalledWith({
            payload: '{"id":"s2"}',
            type: "register_sale.save",
        });
    });

    it("responds 200 when payload is missing (error handled async)", async () => {
        productSyncService.handleSaleUpdate.mockRejectedValue({ status: 400, message: "No payload" });

        const req = makeReq({});
        const res = makeRes();

        await webhookController.saleUpdate(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
    });
});
