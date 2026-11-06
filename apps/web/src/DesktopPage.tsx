import { isTauri, invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

const windowsSchema = z.array(
  z.object({
    handle: z.string(),
    process_id: z.number(),
    title: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    minimized: z.boolean(),
    maximized: z.boolean(),
  }),
);
export function DesktopPage() {
  const [enabled, setEnabled] = useState(false);
  const query = useQuery({
    queryKey: ["native-windows"],
    queryFn: async () => windowsSchema.parse(await invoke("discover_windows")),
    enabled: enabled && isTauri(),
    refetchInterval: enabled ? 5000 : false,
  });
  return (
    <section>
      <p className="eyebrow">Local device</p>
      <h1>Windows in view</h1>
      <p>
        Inspect visible window titles, process IDs, and bounds. This information
        stays in the desktop session.
      </p>
      {!isTauri() ? (
        <p>Open the Windows desktop companion to use native discovery.</p>
      ) : (
        <>
          <button onClick={() => setEnabled(!enabled)}>
            {enabled ? "Stop discovery" : "Allow window discovery"}
          </button>
          {enabled && query.isPending && <p>Discovering windows…</p>}
          {enabled && query.error && <p role="alert">{query.error.message}</p>}
          {enabled &&
            query.data?.map((window) => (
              <div className="integration" key={window.handle}>
                <div>
                  <strong>{window.title}</strong>
                  <small>
                    PID {window.process_id} · {window.width} × {window.height}{" "}
                    at {window.x}, {window.y}
                  </small>
                </div>
                <span>
                  {window.minimized
                    ? "Minimized"
                    : window.maximized
                      ? "Maximized"
                      : "Visible"}
                </span>
              </div>
            ))}
        </>
      )}
    </section>
  );
}
