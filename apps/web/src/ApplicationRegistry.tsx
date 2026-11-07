import { invoke, isTauri } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const appsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), executable: z.string() }),
);
export function ApplicationRegistry() {
  const client = useQueryClient();
  const apps = useQuery({
    queryKey: ["trusted-apps"],
    queryFn: async () => appsSchema.parse(await invoke("list_applications")),
    enabled: isTauri(),
  });
  const register = useMutation({
    mutationFn: () => invoke("register_application"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["trusted-apps"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => invoke("revoke_application", { id }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["trusted-apps"] });
    },
  });
  const launch = useMutation({
    mutationFn: async (id: string) =>
      z.number().parse(await invoke("launch_application", { id })),
  });
  const pending = register.isPending || launch.isPending || revoke.isPending;
  return (
    <section>
      <h2>Trusted applications</h2>
      <p>
        Register a local executable using the native picker. Each launch
        requires local confirmation and checks that the executable has not
        changed.
      </p>
      {!isTauri() ? (
        <p>
          Application registration and launching require the Windows companion.
        </p>
      ) : (
        <>
          <button disabled={pending} onClick={() => register.mutate()}>
            Register application
          </button>
          {apps.data?.length === 0 && <p>No trusted applications registered</p>}
          {apps.data?.map((app) => (
            <div className="integration" key={app.id}>
              <div>
                <strong>{app.name}</strong>
                <small className="local-path">{app.executable}</small>
              </div>
              <button disabled={pending} onClick={() => launch.mutate(app.id)}>
                Request launch
              </button>
              <button disabled={pending} onClick={() => revoke.mutate(app.id)}>
                Revoke
              </button>
            </div>
          ))}
          {launch.isSuccess && (
            <p role="status">
              Process created with PID {launch.data}. Window readiness is not
              yet verified.
            </p>
          )}
          {pending && (
            <p role="status">Waiting for local approval or completion…</p>
          )}
          {[apps.error, register.error, revoke.error, launch.error]
            .filter(Boolean)
            .map((error, index) => (
              <p key={index} role="alert">
                {String(error)}
              </p>
            ))}
        </>
      )}
    </section>
  );
}
