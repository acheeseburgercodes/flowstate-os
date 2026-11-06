import { isTauri, invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

export const windowsSchema = z.array(
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
  const [handles, setHandles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const client = useQueryClient();
  const capture = useMutation({
    mutationFn: () => invoke("capture_snapshot", { name, handles }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["snapshots"] });
    },
  });
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
          <button
            onClick={() => {
              setEnabled(!enabled);
              setHandles([]);
            }}
          >
            {enabled ? "Stop discovery" : "Allow window discovery"}
          </button>
          {enabled && (
            <form
              className="snapshot-capture"
              onSubmit={(event) => {
                event.preventDefault();
                capture.mutate();
              }}
            >
              <label>
                Snapshot name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <button
                disabled={!handles.length || !name.trim() || capture.isPending}
              >
                Capture selected windows
              </button>
              <p>
                Only selected window metadata is saved locally. Visit Time
                Machine to preview it.
              </p>
            </form>
          )}
          {capture.isSuccess && <p role="status">Snapshot captured</p>}
          {capture.error && <p role="alert">{String(capture.error)}</p>}
          {enabled && query.isPending && <p>Discovering windows…</p>}
          {enabled && query.error && <p role="alert">{query.error.message}</p>}
          {enabled &&
            query.data?.map((window) => (
              <div className="integration" key={window.handle}>
                <input
                  className="window-checkbox"
                  type="checkbox"
                  aria-label={`Capture ${window.title}`}
                  checked={handles.includes(window.handle)}
                  onChange={(event) =>
                    setHandles(
                      event.target.checked
                        ? [...handles, window.handle]
                        : handles.filter((handle) => handle !== window.handle),
                    )
                  }
                />
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
