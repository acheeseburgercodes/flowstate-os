import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { request, useConnection } from "./api";

const statusSchema = z.object({
  status: z.string(),
  error: z.string().nullable(),
  rooms: z.array(z.string()),
  history_gap: z.boolean(),
  operation_count: z.number(),
});
const messagesSchema = z.array(
  z.object({
    id: z.string(),
    room_id: z.string(),
    sender: z.string(),
    body: z.string(),
    history_gap: z.boolean(),
    received_at: z.string(),
  }),
);
export function CollaborationPage() {
  const token = useConnection((state) => state.token);
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["switch-status", token],
    queryFn: async () => statusSchema.parse(await request("/switch/status")),
    enabled: !!token,
    refetchInterval: 3000,
  });
  const messages = useQuery({
    queryKey: ["switch-messages", token],
    queryFn: async () =>
      messagesSchema.parse(await request("/switch/messages")),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const connection = useMutation({
    mutationFn: (action: "connect" | "disconnect") =>
      request(`/switch/${action}`, "POST"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["switch-status"] });
      void client.invalidateQueries({ queryKey: ["health"] });
    },
  });
  return (
    <section>
      <p className="eyebrow">Switch collaboration</p>
      <h1>Shared intent. Local control.</h1>
      <p>
        Addressed room messages arrive through the Switch Agent Bridge.
        Receiving a message never launches applications or moves windows.
      </p>
      {!token ? (
        <Link to="/settings">Connect to the workspace service in Settings</Link>
      ) : (
        <>
          <div className="integration">
            <strong>Agent bridge</strong>
            <span>
              {status.data?.status.replaceAll("_", " ") ??
                "Checking connection"}
            </span>
          </div>
          {status.data?.status === "not_configured" && (
            <p>
              Configure SWITCH_BASE_URL, SWITCH_AGENT_ID, SWITCH_AGENT_API_KEY,
              and SWITCH_ROOM_ID on the API service, then restart it. Use a
              separate FlowState relay agent.
            </p>
          )}
          {status.data?.error && <p role="alert">{status.data.error}</p>}
          {status.error && <p role="alert">{status.error.message}</p>}
          <div className="delete-row">
            <button
              disabled={
                connection.isPending ||
                !status.data ||
                [
                  "not_configured",
                  "configuration_error",
                  "connected",
                  "connecting",
                  "reconnecting",
                ].includes(status.data.status)
              }
              onClick={() => connection.mutate("connect")}
            >
              Connect configured room
            </button>
            <button
              disabled={
                connection.isPending ||
                !status.data ||
                ![
                  "connected",
                  "connecting",
                  "reconnecting",
                  "room_unavailable",
                ].includes(status.data.status)
              }
              onClick={() => connection.mutate("disconnect")}
            >
              Disconnect
            </button>
          </div>
          <p className="caption">
            Connecting claims the configured room for this relay agent. Do not
            reuse the Codex agent identity.
          </p>
          {connection.error && <p role="alert">{connection.error.message}</p>}
          {status.data?.history_gap && (
            <p role="alert">
              Switch reported missing history. Review room context before making
              a plan; no automatic response is sent.
            </p>
          )}
          <h2>Room inbox</h2>
          {messages.error && <p role="alert">{messages.error.message}</p>}
          {messages.data?.length === 0 && (
            <p>No addressed messages received yet</p>
          )}
          {messages.data?.map((message) => (
            <article className="room-message" key={message.id}>
              <small>
                {message.sender} · {message.room_id}
              </small>
              <p>{message.body}</p>
              <small>{new Date(message.received_at).toLocaleString()}</small>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
