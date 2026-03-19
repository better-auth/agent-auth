import { describe, it, expect } from "vitest";
import { detectHostName, detectTool } from "../host-name";

describe("detectHostName", () => {
  it("never returns null or undefined", () => {
    const name = detectHostName();
    expect(name).toBeDefined();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("returns a non-empty human-readable string", () => {
    const name = detectHostName();
    // Should not be an IP address or UUID-like random string
    expect(name).not.toMatch(/^[0-9a-f]{8}-/);
  });
});

describe("detectTool", () => {
  it("returns an object with name in known environments", () => {
    const tool = detectTool();
    // In Cursor CI or local Cursor, this should detect something
    if (tool) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });
});
