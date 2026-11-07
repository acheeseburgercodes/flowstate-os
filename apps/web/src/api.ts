import { z } from "zod";
import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";

export const apiBase = isTauri() ? "http://127.0.0.1:8000/api/v1" : "/api/v1";

export const resourceSchema = z.object({
  kind: z.enum(["git_repository", "web_resource"]),
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }, "Use an HTTP(S) URL without credentials"),
});
export const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  intent: z.string().max(2000),
  layout: z.enum(["focus", "split", "coding", "research"]),
  resources: z.array(resourceSchema).max(100),
});
export const workspaceSchema = inputSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceInput = z.infer<typeof inputSchema>;
export const useConnection = create<{
  token: string;
  setToken: (token: string) => void;
}>((set) => ({ token: "", setToken: (token) => set({ token }) }));

export async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${useConnection.getState().token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      response.status === 401
        ? "Connect with your device token in Settings"
        : typeof error.detail === "string"
          ? error.detail
          : `Request failed (${response.status}). Check the API and try again.`,
    );
  }
  return response.status === 204 ? undefined : response.json();
}
export const listWorkspaces = async () =>
  z.array(workspaceSchema).parse(await request("/workspaces"));
export const saveWorkspace = async (input: WorkspaceInput, id?: string) =>
  workspaceSchema.parse(
    await request(
      id ? `/workspaces/${id}` : "/workspaces",
      id ? "PUT" : "POST",
      inputSchema.parse(input),
    ),
  );
