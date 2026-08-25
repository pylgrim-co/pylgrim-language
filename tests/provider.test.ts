import { describe, expect, it } from "vitest";
import { resolveProvider } from "../src/edition/server";
import { FLAGS } from "../src/edition/flags";

/**
 * Provider resolution is an edition question, so this file runs against
 * whichever seam is compiled in. The rules below hold in both; the
 * multi-vendor block only exists self-hosted, where the operator is
 * paying and gets to choose (decision: no-byo-key-on-the-hosted-product).
 */

describe("provider resolution (both editions)", () => {
  it("an explicit PYLGRIM_PROVIDER always wins", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "claude-code", ANTHROPIC_API_KEY: "sk-x" })).toBe("claude-code");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "anthropic" })).toBe("anthropic");
  });

  it('still accepts "api", the old name for the Anthropic path', () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "api" })).toBe("anthropic");
  });

  it("falls back to Anthropic when its key is present", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-x" })).toBe("anthropic");
  });

  it("falls back to the Claude Code subscription with no key at all", () => {
    expect(resolveProvider({})).toBe("claude-code");
  });

  it("ignores unknown PYLGRIM_PROVIDER values", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "banana", ANTHROPIC_API_KEY: "sk-x" })).toBe("anthropic");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "banana" })).toBe("claude-code");
  });
});

describe.runIf(FLAGS.EDITION === "oss")("self-hosted: the operator picks the vendor", () => {
  it("honours an explicit OpenAI or OpenRouter choice", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "openai", ANTHROPIC_API_KEY: "sk-x" })).toBe("openai");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "openrouter", ANTHROPIC_API_KEY: "sk-x" })).toBe("openrouter");
  });

  it("detects whichever key is set when nothing is forced", () => {
    expect(resolveProvider({ OPENAI_API_KEY: "sk-x" })).toBe("openai");
    expect(resolveProvider({ OPENROUTER_API_KEY: "sk-or-x" })).toBe("openrouter");
  });

  it("prefers Anthropic when several keys are present", () => {
    // Not a value judgement on the vendors — the prompts and the
    // per-language model policy were tuned against Anthropic, so it is the
    // one whose output the alignment floor was calibrated on.
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-x", OPENAI_API_KEY: "sk-y", OPENROUTER_API_KEY: "sk-z" })).toBe("anthropic");
    expect(resolveProvider({ OPENAI_API_KEY: "sk-y", OPENROUTER_API_KEY: "sk-z" })).toBe("openai");
  });
});

describe.runIf(FLAGS.EDITION === "cloud")("hosted: one vendor, no choice", () => {
  it("never resolves to a vendor the hosted product does not pay for", () => {
    expect(resolveProvider({ PYLGRIM_PROVIDER: "openai", OPENAI_API_KEY: "sk-x" })).not.toBe("openai");
    expect(resolveProvider({ PYLGRIM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-x" })).not.toBe("openrouter");
    // An unrecognised choice with no Anthropic key falls to the dev path,
    // which is a local-only login rather than a billable service.
    expect(resolveProvider({ OPENAI_API_KEY: "sk-x" })).toBe("claude-code");
  });
});
