const platform = require("../../src/middleware/platform");

function run(req) {
  const next = jest.fn();
  platform(req, {}, next);
  return { platform: req.platform, nextCalled: next.mock.calls.length };
}

describe("v2 platform middleware", () => {
  test("X-Client: web header sets platform=web", () => {
    const { platform: p } = run({ headers: { "x-client": "web" }, cookies: {} });
    expect(p).toBe("web");
  });

  test("X-Client: mobile header sets platform=mobile", () => {
    const { platform: p } = run({ headers: { "x-client": "mobile" }, cookies: {} });
    expect(p).toBe("mobile");
  });

  test("user_token cookie infers web", () => {
    const { platform: p } = run({ headers: {}, cookies: { user_token: "abc" } });
    expect(p).toBe("web");
  });

  test("Authorization: Bearer infers mobile", () => {
    const { platform: p } = run({ headers: { authorization: "Bearer xyz" }, cookies: {} });
    expect(p).toBe("mobile");
  });

  test("X-Client header takes precedence over cookie", () => {
    const { platform: p } = run({ headers: { "x-client": "mobile" }, cookies: { user_token: "abc" } });
    expect(p).toBe("mobile");
  });

  test("unknown when no signal", () => {
    const { platform: p } = run({ headers: {}, cookies: {} });
    expect(p).toBe("unknown");
  });

  test("invalid X-Client value falls through to other detection", () => {
    const { platform: p } = run({ headers: { "x-client": "garbage" }, cookies: { user_token: "abc" } });
    expect(p).toBe("web");
  });

  test("calls next()", () => {
    const { nextCalled } = run({ headers: {}, cookies: {} });
    expect(nextCalled).toBe(1);
  });
});
