import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { windowsSchema } from "./DesktopPage";

const monitorsSchema = z.array(
  z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    primary: z.boolean(),
  }),
);
const resultSchema = z.object({
  rollback_snapshot_id: z.string(),
  results: z.array(
    z.object({ title: z.string(), success: z.boolean(), detail: z.string() }),
  ),
});
export function LayoutControls({ handles }: { handles: string[] }) {
  const [display, setDisplay] = useState("");
  const [layout, setLayout] = useState("split");
  const client = useQueryClient();
  const monitors = useQuery({
    queryKey: ["monitors"],
    queryFn: async () => monitorsSchema.parse(await invoke("list_monitors")),
    refetchInterval: 10000,
  });
  const monitorId =
    display || monitors.data?.find((monitor) => monitor.primary)?.id || "";
  const preview = useQuery({
    queryKey: ["layout-preview", handles, monitorId, layout],
    queryFn: async () =>
      windowsSchema.parse(
        await invoke("preview_layout", { handles, monitorId, layout }),
      ),
    enabled: handles.length > 0 && !!monitorId,
    retry: false,
  });
  const arrange = useMutation({
    mutationFn: async () =>
      resultSchema.parse(
        await invoke("arrange_windows", { handles, monitorId, layout }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["snapshots"] });
      void client.invalidateQueries({ queryKey: ["native-windows"] });
    },
  });
  return (
    <section className="snapshot-capture">
      <h2>Arrange selected windows</h2>
      <label>
        Display
        <select
          value={monitorId}
          onChange={(event) => setDisplay(event.target.value)}
        >
          {monitors.data?.map((monitor) => (
            <option key={monitor.id} value={monitor.id}>
              {monitor.primary ? "Primary" : "Display"} · {monitor.width} ×{" "}
              {monitor.height} at {monitor.x}, {monitor.y}
            </option>
          ))}
        </select>
      </label>
      <label>
        Layout
        <select
          value={layout}
          onChange={(event) => setLayout(event.target.value)}
        >
          {[
            "focus",
            "split",
            "triple",
            "coding",
            "research",
            "presentation",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <p>
        Selection order determines placement. Choose normal windows: one for
        focus/presentation, two for split/coding/research, or three for triple.
      </p>
      {preview.data?.map((window) => (
        <small key={window.handle}>
          {window.title}: {window.width} × {window.height} at {window.x},{" "}
          {window.y}
        </small>
      ))}
      {[monitors.error, preview.error, arrange.error]
        .filter(Boolean)
        .map((error, index) => (
          <p key={index} role="alert">
            {String(error)}
          </p>
        ))}
      <button
        disabled={!preview.isSuccess || arrange.isPending}
        onClick={() => arrange.mutate()}
      >
        Request arrangement
      </button>
      {arrange.data && (
        <>
          <p>A rollback snapshot is available in Time Machine.</p>
          {arrange.data.results.map((result, index) => (
            <p key={index} role={result.success ? "status" : "alert"}>
              {result.title}: {result.detail}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
