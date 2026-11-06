import { describe, expect, it } from "vitest";
import { inputSchema, resourceSchema, useConnection } from "./api";
describe("workspace boundary", () => {
  it("rejects local URLs and embedded credentials", () => {
    for (const url of [
      "file:///C:/private",
      "javascript:alert(1)",
      "https://user:secret@example.com",
    ])
      expect(
        resourceSchema.safeParse({ kind: "web_resource", url }).success,
      ).toBe(false);
  });
  it("requires a meaningful name", () => {
    expect(
      inputSchema.safeParse({
        name: " ",
        intent: "",
        layout: "coding",
        resources: [],
      }).success,
    ).toBe(false);
  });
  it("revokes the session token", () => {
    useConnection.getState().setToken("test");
    useConnection.getState().setToken("");
    expect(useConnection.getState().token).toBe("");
  });
});
