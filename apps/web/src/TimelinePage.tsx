import { invoke, isTauri } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { windowsSchema } from "./DesktopPage";

const snapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  captured_at: z.number(),
  schema_version: z.union([z.literal(1), z.literal(2)]),
  windows: windowsSchema,
});
const resultSchema = z.object({
  rollback_snapshot_id: z.string(),
  results: z.array(
    z.object({ title: z.string(), success: z.boolean(), detail: z.string() }),
  ),
});
export function TimelinePage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const [deleting, setDeleting] = useState(false);
  const query = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () =>
      z.array(snapshotSchema).parse(await invoke("list_snapshots")),
    enabled: isTauri(),
  });
  const restore = useMutation({
    mutationFn: async (id: string) =>
      resultSchema.parse(await invoke("restore_snapshot", { id })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["snapshots"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => invoke("delete_snapshot", { id }),
    onSuccess: () => {
      setSelected("");
      setDeleting(false);
      void client.invalidateQueries({ queryKey: ["snapshots"] });
    },
  });
  const snapshot = query.data?.find((item) => item.id === selected);
  return (
    <section>
      <p className="eyebrow">Workspace Time Machine</p>
      <h1>Return to your arrangement</h1>
      <p>
        Snapshots stay on this device. Restore moves matching, still-running
        normal windows. Closed, renamed, elevated, minimized, or maximized
        windows are reported as unsupported.
      </p>
      {!isTauri() ? (
        <p>Open the desktop companion to capture and restore windows.</p>
      ) : (
        <>
          <p>Capture a selection from Local windows, then preview it here.</p>
          {query.error && <p role="alert">{String(query.error)}</p>}
          {query.isPending && <p>Loading snapshots…</p>}
          {query.data?.length === 0 && <p>No snapshots captured yet</p>}
          <div className="snapshot-timeline">
            {query.data?.map((item) => (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setDeleting(false);
                  restore.reset();
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {new Date(item.captured_at * 1000).toLocaleString()}
                </small>
                <small>{item.windows.length} captured windows</small>
              </button>
            ))}
          </div>
          {snapshot && (
            <>
              <h2>Preview: {snapshot.name}</h2>
              {snapshot.windows.map((window) => (
                <div className="integration" key={window.handle}>
                  <div>
                    {window.title}
                    <small>
                      {window.width} × {window.height} at {window.x}, {window.y}
                    </small>
                  </div>
                  <span>
                    {window.minimized || window.maximized
                      ? "State unsupported"
                      : "Normal window"}
                  </span>
                </div>
              ))}
              <div className="delete-row">
                <button
                  className="primary"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(snapshot.id)}
                >
                  Request local restore
                </button>
                <button
                  disabled={restore.isPending || remove.isPending}
                  onClick={() =>
                    deleting ? remove.mutate(snapshot.id) : setDeleting(true)
                  }
                >
                  {deleting ? "Confirm delete snapshot" : "Delete snapshot"}
                </button>
              </div>
              {restore.isPending && (
                <p role="status">
                  Awaiting native approval or verifying window positions…
                </p>
              )}
            </>
          )}
          {restore.error && <p role="alert">{String(restore.error)}</p>}
          {remove.error && <p role="alert">{String(remove.error)}</p>}
          {restore.data && (
            <div>
              <h2>Restore results</h2>
              {restore.data.results.map((result, index) => (
                <p key={index} role={result.success ? "status" : "alert"}>
                  {result.title}: {result.detail}
                </p>
              ))}
              <button
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(restore.data!.rollback_snapshot_id)
                }
              >
                Request rollback
              </button>
              <p>
                A rollback also requires native approval and verifies each
                window.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
