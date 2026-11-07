import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { request, resourceSchema } from "./api";
import { ExecutionPanel } from "./ExecutionPanel";

export const manifestSchema = z
  .object({
    schema_version: z.literal(1),
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    switch_room_id: z.string().min(1),
    resources: z.array(resourceSchema).max(100),
    suggested_layout: z.enum(["focus", "split", "coding", "research"]),
    approval_required: z.literal(true),
  })
  .strict();
const planSchema = z.object({
  id: z.string().uuid(),
  revision: z.number(),
  state: z.enum(["draft", "approved", "rejected"]),
  manifest: manifestSchema,
  source_message_ids: z.array(z.string()),
  publication: z.string(),
  local_approval_required: z.literal(true),
});
type Plan = z.infer<typeof planSchema>;
type Message = {
  id: string;
  sender: string;
  body: string;
  room_id: string;
  history_gap: boolean;
};

export function SharedPlans({ messages }: { messages: Message[] }) {
  const query = useQuery({
    queryKey: ["shared-plans"],
    queryFn: async () => z.array(planSchema).parse(await request("/proposals")),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const plan = query.data?.find((item) => item.id === selected);
  return (
    <section className="shared-plans">
      <div className="section-heading">
        <h2>Shared workspace plans</h2>
        <button
          onClick={() => {
            setSelected(null);
            setCreating(true);
          }}
        >
          New shared plan
        </button>
      </div>
      <p>
        Room contributions inform a portable plan. Approval applies to one
        revision; every device still approves its own actions.
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.length === 0 && <p>No shared plans saved</p>}
      <div className="snapshot-timeline">
        {query.data?.map((item) => (
          <button
            key={item.id}
            aria-pressed={item.id === selected}
            onClick={() => {
              setSelected(item.id);
              setCreating(false);
            }}
          >
            <strong>{item.manifest.name}</strong>
            <small>
              Revision {item.revision} · {item.state}
            </small>
            <small>
              Room publication: {item.publication.replaceAll("_", " ")}
            </small>
          </button>
        ))}
      </div>
      {(creating || plan) && (
        <PlanEditor
          key={
            plan
              ? `${plan.id}:${plan.revision}:${plan.state}:${plan.publication}`
              : "new"
          }
          plan={plan}
          messages={messages}
          onSaved={(id) => {
            setSelected(id);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}

function PlanEditor({
  plan,
  messages,
  onSaved,
}: {
  plan?: Plan;
  messages: Message[];
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(plan?.manifest.name ?? "");
  const [room, setRoom] = useState(plan?.manifest.switch_room_id ?? "");
  const [layout, setLayout] = useState(
    plan?.manifest.suggested_layout ?? "coding",
  );
  const [urls, setUrls] = useState(
    plan?.manifest.resources.map((resource) => resource.url).join("\n") ?? "",
  );
  const [sources, setSources] = useState<string[]>(
    plan?.source_message_ids ?? [],
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [workspaceId] = useState(
    () => plan?.manifest.workspace_id ?? crypto.randomUUID(),
  );
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: "save" | "approve" | "reject" | "publish") => {
      if (action === "save") {
        const manifest = manifestSchema.parse({
          schema_version: 1,
          workspace_id: workspaceId,
          name,
          switch_room_id: room,
          suggested_layout: layout,
          approval_required: true,
          resources: urls
            .split("\n")
            .map((url) => url.trim())
            .filter(Boolean)
            .map((url) => ({
              kind:
                plan?.manifest.resources.find(
                  (resource) => resource.url === url,
                )?.kind ?? "web_resource",
              url,
            })),
        });
        return planSchema.parse(
          await request(
            plan ? `/proposals/${plan.id}` : "/proposals",
            plan ? "PUT" : "POST",
            plan
              ? { revision: plan.revision, manifest }
              : {
                  idempotency_key: requestId,
                  manifest,
                  source_message_ids: sources,
                },
          ),
        );
      }
      if (!plan) throw new Error("Save the draft before deciding");
      return planSchema.parse(
        await request(
          `/proposals/${plan.id}/${action === "publish" ? "publish" : "decision"}`,
          "POST",
          {
            revision: plan.revision,
            ...(action === "publish" ? {} : { decision: action }),
          },
        ),
      );
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: ["shared-plans"] });
      onSaved(saved.id);
    },
  });
  const locked = plan?.state !== undefined && plan.state !== "draft";
  const dirty =
    !!plan &&
    (name !== plan.manifest.name ||
      room !== plan.manifest.switch_room_id ||
      layout !== plan.manifest.suggested_layout ||
      urls !==
        plan.manifest.resources.map((resource) => resource.url).join("\n"));
  return (
    <form
      className="plan-editor"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate("save");
      }}
    >
      <label>
        Plan name
        <input
          required
          value={name}
          disabled={locked}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Switch room ID
        <input
          required
          value={room}
          disabled={locked || !!plan?.source_message_ids.length}
          onChange={(event) => setRoom(event.target.value)}
        />
      </label>
      <label>
        Resource URLs, one per line
        <textarea
          required
          value={urls}
          disabled={locked}
          onChange={(event) => setUrls(event.target.value)}
        />
      </label>
      <label>
        Suggested layout
        <select
          disabled={locked}
          value={layout}
          onChange={(event) => setLayout(event.target.value as typeof layout)}
        >
          {["focus", "split", "coding", "research"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {!plan && (
        <fieldset>
          <legend>Room contributions</legend>
          {messages
            .filter((message) => message.room_id === room)
            .map((message) => (
              <label className="source-choice" key={message.id}>
                <input
                  className="window-checkbox"
                  type="checkbox"
                  disabled={message.history_gap}
                  checked={sources.includes(message.id)}
                  onChange={(event) =>
                    setSources(
                      event.target.checked
                        ? [...sources, message.id]
                        : sources.filter((id) => id !== message.id),
                    )
                  }
                />
                <span>
                  {message.sender}: {message.body.slice(0, 160)}
                </span>
              </label>
            ))}
          {!messages.some((message) => message.room_id === room) && (
            <p>
              No received contributions for this room. This will be a manually
              composed plan.
            </p>
          )}
        </fieldset>
      )}
      <p>
        Only the listed URLs, room identifier, plan name, and layout are shared.
        Local paths and executable registrations stay on your device.
      </p>
      <div className="delete-row">
        {!locked && (
          <button className="primary" disabled={mutation.isPending}>
            Save draft
          </button>
        )}
        {plan?.state === "draft" && (
          <>
            <button
              type="button"
              disabled={mutation.isPending || dirty}
              onClick={() => mutation.mutate("approve")}
            >
              Approve revision {plan.revision}
            </button>
            <button
              type="button"
              disabled={mutation.isPending || dirty}
              onClick={() => mutation.mutate("reject")}
            >
              Reject
            </button>
          </>
        )}
        {plan?.state === "approved" && plan.publication === "not_sent" && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("publish")}
          >
            Publish approved plan to room
          </button>
        )}
      </div>
      {dirty && <p>Save changes before approving this revision.</p>}
      {plan?.publication === "unknown" && (
        <p role="alert">
          Publication could not be confirmed. Check the room; automatic retry is
          disabled.
        </p>
      )}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {plan?.state === "approved" && (
        <ExecutionPanel
          urls={plan.manifest.resources.map((resource) => resource.url)}
        />
      )}
    </form>
  );
}
