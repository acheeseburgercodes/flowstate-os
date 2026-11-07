import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";

export const executionSchema = z.object({
  id: z.string(),
  state: z.string(),
  results: z.array(
    z.object({ index: z.number(), state: z.string(), detail: z.string() }),
  ),
});
const appsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), executable: z.string() }),
);
export function ExecutionPanel({ urls }: { urls: string[] }) {
  const [id] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<z.infer<typeof executionSchema> | null>(
    null,
  );
  const [eventError, setEventError] = useState("");
  const apps = useQuery({
    queryKey: ["trusted-apps"],
    queryFn: async () => appsSchema.parse(await invoke("list_applications")),
    enabled: isTauri(),
  });
  const execute = useMutation({
    mutationFn: async () =>
      executionSchema.parse(
        await invoke("execute_plan", {
          id,
          actions: [
            ...selected.map((application_id) => ({
              kind: "launch_application",
              application_id,
            })),
            ...urls.map((url) => ({ kind: "open_url", url })),
          ],
        }),
      ),
    onSuccess: setResult,
  });
  const cancel = useMutation({ mutationFn: () => invoke("cancel_execution") });
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen("execution-progress", (event) => {
      const parsed = executionSchema.safeParse(event.payload);
      if (parsed.success && parsed.data.id === id) setResult(parsed.data);
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else cleanup = unlisten;
      })
      .catch(() =>
        setEventError(
          "Live progress could not be subscribed. Final results will still appear.",
        ),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [id]);
  if (!isTauri())
    return (
      <p>
        Open this approved plan in the Windows companion to request local
        execution.
      </p>
    );
  return (
    <section className="execution-panel">
      <h2>Prepare this device</h2>
      <p>
        Open {urls.length} resource URLs in the default browser and launch any
        applications selected below. A native dialog confirms the exact actions.
        Project folders and window arrangement are not included yet.
      </p>
      {apps.data?.map((app) => (
        <label className="source-choice" key={app.id}>
          <input
            className="window-checkbox"
            type="checkbox"
            disabled={execute.isPending || !!result}
            checked={selected.includes(app.id)}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? [...selected, app.id]
                  : selected.filter((value) => value !== app.id),
              )
            }
          />
          <span>{app.name}</span>
        </label>
      ))}
      {apps.error && <p role="alert">{apps.error.message}</p>}
      <div className="delete-row">
        <button
          type="button"
          disabled={
            execute.isPending ||
            !!result ||
            urls.length + selected.length === 0 ||
            urls.length + selected.length > 20
          }
          onClick={() => execute.mutate()}
        >
          Request local execution
        </button>
        {execute.isPending && (
          <button
            type="button"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            Cancel remaining actions
          </button>
        )}
      </div>
      {eventError && <p>{eventError}</p>}
      {[execute.error, cancel.error].filter(Boolean).map((error, index) => (
        <p role="alert" key={index}>
          {String(error)}
        </p>
      ))}
      {result && (
        <>
          <p role="status">Execution: {result.state.replaceAll("_", " ")}</p>
          {result.results.map((action) => (
            <p
              key={action.index}
              role={action.state === "failed" ? "alert" : "status"}
            >
              Action {action.index + 1}: {action.detail}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

export function ActivityPage() {
  const query = useQuery({
    queryKey: ["local-executions"],
    queryFn: async () =>
      z.array(executionSchema).parse(await invoke("list_executions")),
    enabled: isTauri(),
    refetchInterval: 3000,
  });
  return (
    <section>
      <h1>Execution activity</h1>
      <p>
        Local action results stay on this device. A created process or accepted
        browser request does not prove that an application's contents finished
        loading.
      </p>
      {!isTauri() ? (
        <p>Execution history is available in the Windows companion.</p>
      ) : (
        <>
          {query.error && <p role="alert">{query.error.message}</p>}
          {query.data?.length === 0 && <p>No local plan executions recorded</p>}
          {query.data?.map((execution) => (
            <article className="room-message" key={execution.id}>
              <strong>{execution.state.replaceAll("_", " ")}</strong>
              <small>{execution.id}</small>
              {execution.results.map((result) => (
                <p key={result.index}>
                  Action {result.index + 1}: {result.detail}
                </p>
              ))}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
