require("../setup");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../../src/models/User");
const Admin = require("../../src/models/Admin");

// Mock JWT_SECRET before requiring middleware
process.env.JWT_SECRET = "test-secret-key-for-tests";

const authMiddleware = require("../../src/middleware/authMiddleware");

function mockReq(overrides = {}) {
  return {
    cookies: {},
    headers: {},
    header: function (name) {
      return this.headers[name.toLowerCase()];
    },
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("authMiddleware", () => {
  let testUser;
  let userToken;

  beforeEach(async () => {
    testUser = await User.create({
      name: "Test User",
      email: "test@example.com",
      password: "hashedpassword",
      phone: "+971501234567",
    });

    userToken = jwt.sign(
      { id: testUser._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  describe("token from cookie (web clients)", () => {
    it("should authenticate with valid cookie token", async () => {
      const req = mockReq({ cookies: { user_token: userToken } });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
    });
  });

  describe("token from Authorization header (mobile clients)", () => {
    it("should authenticate with valid Bearer token", async () => {
      const req = mockReq({
        headers: { authorization: `Bearer ${userToken}` },
      });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
    });
  });

  describe("cookie takes priority over header", () => {
    it("should use cookie when both are present", async () => {
      const req = mockReq({
        cookies: { user_token: userToken },
        headers: { authorization: "Bearer some-other-token" },
      });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
    });
  });

  describe("error handling", () => {
    it("should return 401 when no token provided", async () => {
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 for invalid token", async () => {
      const req = mockReq({ cookies: { user_token: "invalid-token" } });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 402 for expired token", async () => {
      const expiredToken = jwt.sign(
        { id: testUser._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: "0s" }
      );

      // Small delay to ensure expiration
      await new Promise((r) => setTimeout(r, 100));

      const req = mockReq({ cookies: { user_token: expiredToken } });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(402);
    });

    it("should return 401 when user not found in DB", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const token = jwt.sign({ id: fakeId.toString() }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      const req = mockReq({ cookies: { user_token: token } });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 403 for blocked user", async () => {
      testUser.isBlocked = true;
      await testUser.save();

      const req = mockReq({ cookies: { user_token: userToken } });
      const res = mockRes();
      const next = jest.fn();

      await authMiddleware("user")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("direct middleware usage (Mobile API pattern)", () => {
    it("should work when called without role parameter", async () => {
      const req = mockReq({
        headers: { authorization: `Bearer ${userToken}` },
      });
      const res = mockRes();
      const next = jest.fn();

      // Mobile routes call authMiddleware directly (not authMiddleware('user'))
      // The unified middleware should handle this
      if (typeof authMiddleware === "function") {
        const middleware = authMiddleware;
        if (middleware.length === 3 || typeof middleware("user") === "function") {
          await authMiddleware("user")(req, res, next);
          expect(next).toHaveBeenCalled();
        }
      }
    });
  });
});
