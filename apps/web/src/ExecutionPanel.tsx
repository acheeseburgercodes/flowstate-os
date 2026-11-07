import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "./api";

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
const projectsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), directory: z.string() }),
);
export function ExecutionPanel({
  urls,
  proposalId,
  revision,
}: {
  urls: string[];
  proposalId: string;
  revision: number;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [codeApp, setCodeApp] = useState("");
  const client = useQueryClient();
  const projects = useQuery({
    queryKey: ["local-projects"],
    queryFn: async () => projectsSchema.parse(await invoke("list_projects")),
    enabled: isTauri(),
  });
  const registerProject = useMutation({
    mutationFn: () => invoke("register_project"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["local-projects"] });
    },
  });
  const revokeProject = useMutation({
    mutationFn: () => invoke("revoke_project", { id: project }),
    onSuccess: () => {
      setProject("");
      void client.invalidateQueries({ queryKey: ["local-projects"] });
    },
  });
  const [result, setResult] = useState<z.infer<typeof executionSchema> | null>(
    null,
  );
  const [eventError, setEventError] = useState("");
  const report = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No local result to report");
      return z.object({ publication: z.string() }).parse(
        await request(`/proposals/${proposalId}/report`, "POST", {
          execution_id: result.id,
          revision,
          state: result.state,
          completed_count: result.results.filter(
            (action) => action.state === "completed",
          ).length,
          failed_count: result.results.filter(
            (action) => action.state === "failed",
          ).length,
        }),
      );
    },
  });
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
            ...selected
              .filter(
                (application_id) => !(project && codeApp === application_id),
              )
              .map((application_id) => ({
                kind: "launch_application",
                application_id,
              })),
            ...urls.map((url) => ({ kind: "open_url", url })),
            ...(project && codeApp
              ? [
                  {
                    kind: "open_project",
                    application_id: codeApp,
                    project_id: project,
                  },
                ]
              : []),
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
        Optionally map this workspace to an authorized local folder in VS Code.
        Arrange the resulting windows from Local windows after they open.
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
      <label>
        Local project folder
        <select
          disabled={execute.isPending || !!result}
          value={project}
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">No project folder</option>
          {projects.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.directory}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={registerProject.isPending || execute.isPending || !!result}
        onClick={() => registerProject.mutate()}
      >
        Authorize project folder
      </button>
      {project && (
        <>
          <label>
            Registered VS Code application
            <select
              disabled={execute.isPending || !!result}
              value={codeApp}
              onChange={(event) => setCodeApp(event.target.value)}
            >
              <option value="">Choose VS Code</option>
              {apps.data
                ?.filter((app) =>
                  /[\\/]Code(?: - Insiders)?\.exe$/i.test(app.executable),
                )
                .map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={revokeProject.isPending || execute.isPending || !!result}
            onClick={() => revokeProject.mutate()}
          >
            Revoke project access
          </button>
        </>
      )}
      <p className="caption">
        Project paths are stored on this device only. Register Code.exe in
        Integrations if it is not listed.
      </p>
      {[apps.error, projects.error, registerProject.error, revokeProject.error]
        .filter(Boolean)
        .map((error, index) => (
          <p key={index} role="alert">
            {String(error)}
          </p>
        ))}
      <div className="delete-row">
        <button
          type="button"
          disabled={
            execute.isPending ||
            !!result ||
            urls.length + selected.length + (project && codeApp ? 1 : 0) ===
              0 ||
            urls.length + selected.length + (project && codeApp ? 1 : 0) > 20 ||
            (!!project && !codeApp)
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
          {!execute.isPending &&
            [
              "completed",
              "partially_completed",
              "failed",
              "cancelled",
              "interrupted",
            ].includes(result.state) && (
              <>
                <button
                  type="button"
                  disabled={report.isPending || report.isSuccess}
                  onClick={() => report.mutate()}
                >
                  Publish result counts to Switch room
                </button>
                <p className="caption">
                  Only execution ID, state, and counts are shared. Local paths
                  and window titles remain private.
                </p>
              </>
            )}
          {report.data && (
            <p role={report.data.publication === "sent" ? "status" : "alert"}>
              Report publication: {report.data.publication}.{" "}
              {report.data.publication === "unknown"
                ? "Check the room before any manual resend."
                : ""}
            </p>
          )}
          {report.error && <p role="alert">{report.error.message}</p>}
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
