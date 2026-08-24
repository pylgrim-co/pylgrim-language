import { describe, expect, it } from "vitest";
import { resolveProvider } from "../src/lib/provider";

describe("provider resolution", () => {
  it("an explicit PYLGRIM_PROVIDER always wins", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "claude-code", ANTHROPIC_API_KEY: "sk-x" })).toBe("claude-code");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "api" })).toBe("api");
  });

  it("falls back to the API when a key is present", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-x" })).toBe("api");
  });

  it("falls back to the Claude Code subscription without a key", () => {
    expect(resolveProvider({})).toBe("claude-code");
  });

  it("ignores unknown PYLGRIM_PROVIDER values", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "banana", ANTHROPIC_API_KEY: "sk-x" })).toBe("api");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "banana" })).toBe("claude-code");
  });
});
