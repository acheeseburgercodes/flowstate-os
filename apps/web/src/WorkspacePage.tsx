import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  request,
  saveWorkspace,
  workspaceSchema,
  type Workspace,
  type WorkspaceInput,
} from "./api";

export function WorkspacePage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["workspace", id],
    queryFn: async () =>
      workspaceSchema.parse(await request(`/workspaces/${id}`)),
  });
  if (query.isPending) return <p>Loading workspace…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return <Editor key={query.data.id} workspace={query.data} />;
}
function Editor({ workspace }: { workspace: Workspace }) {
  const [draft, setDraft] = useState<WorkspaceInput>(workspace);
  const [selected, setSelected] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: () => saveWorkspace(draft, workspace.id),
    onSuccess: (saved) => {
      client.setQueryData(["workspace", workspace.id], saved);
      void client.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => request(`/workspaces/${workspace.id}`, "DELETE"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["workspaces"] });
      navigate("/");
    },
  });
  const nodes = [
    {
      id: "workspace",
      position: { x: 40, y: 140 },
      data: { label: draft.name },
    },
    ...draft.resources.map((resource, index) => ({
      id: String(index),
      position: { x: 360, y: index * 100 + 40 },
      data: { label: resource.url || "Resource URL required" },
    })),
  ];
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace configuration</p>
          <h1>{draft.name}</h1>
        </div>
        <span>Draft · Not activated</span>
      </div>
      <div className="editor">
        <section>
          <div className="canvas">
            <ReactFlow
              key={draft.resources.length}
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              nodes={nodes}
              edges={draft.resources.map((_, index) => ({
                id: `edge-${index}`,
                source: "workspace",
                target: String(index),
              }))}
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, node) => setSelected(node.data.label)}
              fitView
              colorMode="dark"
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <p className="caption">
            Resource relationships · This diagram does not represent native
            window positions
          </p>
          {selected && (
            <div className="metadata">Selected resource: {selected}</div>
          )}
        </section>
        <form
          className="inspector"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2>Workspace details</h2>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Intent
            <textarea
              maxLength={2000}
              value={draft.intent}
              onChange={(e) => setDraft({ ...draft, intent: e.target.value })}
            />
          </label>
          <label>
            Preferred layout
            <select
              value={draft.layout}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  layout: e.target.value as WorkspaceInput["layout"],
                })
              }
            >
              {["focus", "split", "coding", "research"].map((layout) => (
                <option key={layout}>{layout}</option>
              ))}
            </select>
          </label>
          <h2>Resources</h2>
          {draft.resources.map((resource, index) => (
            <div className="resource" key={index}>
              <label>
                Resource {index + 1}
                <input
                  aria-label={`Resource ${index + 1} URL`}
                  type="url"
                  required
                  value={resource.url}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      resources: draft.resources.map((item, i) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    resources: draft.resources.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                resources: [
                  ...draft.resources,
                  { kind: "web_resource", url: "" },
                ],
              })
            }
          >
            Add URL
          </button>
          <button className="primary" disabled={save.isPending}>
            Save configuration
          </button>
          {save.isSuccess && <p role="status">Configuration saved</p>}
          {save.error && <p role="alert">{save.error.message}</p>}
          <p className="caption">Activation requires the desktop companion</p>
        </form>
      </div>
      <div className="delete-row">
        {confirmDelete ? (
          <>
            <span>Delete this saved configuration?</span>
            <button onClick={() => remove.mutate()} disabled={remove.isPending}>
              Confirm delete
            </button>
            <button onClick={() => setConfirmDelete(false)}>
              Keep workspace
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)}>
            Delete workspace
          </button>
        )}
        {remove.error && <p role="alert">{remove.error.message}</p>}
      </div>
    </>
  );
}
