const {
  velaApiRequest,
  velaUserId,
  parsePrismaUserId,
} = require("../../utils/velaApi");

describe("velaApi", () => {
  const originalUrl = process.env.VELA_API_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.VELA_API_URL;
    else process.env.VELA_API_URL = originalUrl;
  });

  test("velaUserId returns string id or anonymous", () => {
    expect(velaUserId({ id: 42 })).toBe("42");
    expect(velaUserId(null)).toBe("anonymous");
  });

  test("parsePrismaUserId accepts positive integers only", () => {
    expect(parsePrismaUserId(42)).toBe(42);
    expect(parsePrismaUserId("7")).toBe(7);
    expect(parsePrismaUserId("admin-user")).toBeNull();
    expect(parsePrismaUserId(null)).toBeNull();
  });

  test("velaApiRequest returns 503 when VELA_API_URL unset", async () => {
    delete process.env.VELA_API_URL;
    const result = await velaApiRequest("projects");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/not configured/i);
  });
});
