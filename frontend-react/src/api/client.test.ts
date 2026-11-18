import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./client";

describe("api client demo login", () => {
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    const mockStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = val;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("stores demo token and demo user in fallback mode when network fails", async () => {
    // Mock global fetch to simulate network error or offline mode
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

    const res = await api.loginDemo();
    expect(res.access_token).toContain("mlforge-demo-token-");
    expect(res.email).toBe("demo@mlforge.ai");
    expect(res.token_type).toBe("bearer");

    expect(localStorage.getItem("mlforge_token")).toBe(res.access_token);
    const storedUser = JSON.parse(localStorage.getItem("mlforge_user") || "{}");
    expect(storedUser.email).toBe("demo@mlforge.ai");
    expect(storedUser.is_demo).toBe(true);
  });

  it("stores demo token from backend when /auth/demo succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "backend-issued-demo-token-12345",
        token_type: "bearer",
        user_id: "backend-demo-uid",
        email: "demo@mlforge.ai",
      }),
    });

    const res = await api.loginDemo();
    expect(res.access_token).toBe("backend-issued-demo-token-12345");
    expect(res.email).toBe("demo@mlforge.ai");
    expect(localStorage.getItem("mlforge_token")).toBe("backend-issued-demo-token-12345");
  });
});
