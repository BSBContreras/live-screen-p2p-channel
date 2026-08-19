import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT) || 3001;
const MAX_PARTICIPANTS = 8;
const MAX_NAME_LENGTH = 50;

type Membership = { roomId: string; clientId: string };
type Client = { socket: WebSocket; name: string; shareId: string | null };
type Room = { clients: Map<string, Client> };

const rooms = new Map<string, Room>();
const memberships = new WeakMap<WebSocket, Membership>();
const directedSignals = new Set(["offer", "answer", "ice-candidate"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function send(socket: WebSocket, payload: object) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room: Room, payload: object, exceptClientId?: string) {
  room.clients.forEach((client, clientId) => {
    if (clientId !== exceptClientId) send(client.socket, payload);
  });
}

function participant(id: string, client: Client) {
  return { id, name: client.name, shareId: client.shareId };
}

function leave(socket: WebSocket) {
  const membership = memberships.get(socket);
  if (!membership) return;
  const { roomId, clientId } = membership;
  const room = rooms.get(roomId);
  memberships.delete(socket);
  if (!room || room.clients.get(clientId)?.socket !== socket) return;

  const client = room.clients.get(clientId)!;
  room.clients.delete(clientId);
  if (client.shareId) {
    broadcast(room, { type: "sharing-stopped", roomId, peerId: clientId, shareId: client.shareId });
  }
  broadcast(room, { type: "participant-left", roomId, peerId: clientId });
  if (!room.clients.size) rooms.delete(roomId);
}

const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
  socket.on("error", (error) => console.warn("WebSocket client error:", error.message));
  socket.on("close", () => leave(socket));
  socket.on("message", (raw, isBinary) => {
    const rawSize = Array.isArray(raw)
      ? raw.reduce((total, chunk) => total + chunk.byteLength, 0)
      : raw.byteLength;
    if (isBinary || rawSize > 1_000_000) return;

    try {
      const message: unknown = JSON.parse(raw.toString());
      if (!isRecord(message) || typeof message.type !== "string" || typeof message.roomId !== "string") return;
      const roomId = message.roomId.trim();
      if (!roomId || roomId.length > 128) return;

      if (message.type === "join-room") {
        if (memberships.has(socket)) return;
        if (typeof message.clientId !== "string" || !message.clientId || message.clientId.length > 128) return;
        if (typeof message.userName !== "string") return;
        const name = message.userName.trim();
        if (!name || name.length > MAX_NAME_LENGTH) {
          send(socket, { type: "error", message: `O nome deve ter entre 1 e ${MAX_NAME_LENGTH} caracteres.` });
          return;
        }

        const clientId = message.clientId;
        const room = rooms.get(roomId) ?? { clients: new Map<string, Client>() };
        const previous = room.clients.get(clientId);
        if (!previous && room.clients.size >= MAX_PARTICIPANTS) {
          send(socket, { type: "error", message: `Esta sala já atingiu o limite de ${MAX_PARTICIPANTS} participantes.` });
          return;
        }

        if (previous) {
          if (previous.shareId) {
            broadcast(room, { type: "sharing-stopped", roomId, peerId: clientId, shareId: previous.shareId }, clientId);
          }
          broadcast(room, { type: "participant-left", roomId, peerId: clientId }, clientId);
        }

        const client: Client = { socket, name, shareId: null };
        room.clients.set(clientId, client);
        rooms.set(roomId, room);
        memberships.set(socket, { roomId, clientId });
        previous?.socket.close(1000, "Replaced by a newer connection");

        send(socket, {
          type: "room-state",
          roomId,
          participants: [...room.clients].map(([id, roomClient]) => participant(id, roomClient)),
        });
        broadcast(room, { type: "participant-joined", roomId, participant: participant(clientId, client) }, clientId);
        return;
      }

      const membership = memberships.get(socket);
      const room = rooms.get(roomId);
      if (membership?.roomId !== roomId || !room) return;
      const senderId = membership.clientId;
      const sender = room.clients.get(senderId);
      if (!sender || sender.socket !== socket) return;

      if (message.type === "start-sharing") {
        if (typeof message.shareId !== "string" || !message.shareId || message.shareId.length > 128) return;
        if (sender.shareId && sender.shareId !== message.shareId) return;
        sender.shareId = message.shareId;
        broadcast(room, { type: "sharing-started", roomId, participant: participant(senderId, sender) });
        return;
      }

      if (message.type === "sharing-stopped") {
        if (typeof message.shareId !== "string" || sender.shareId !== message.shareId) return;
        const shareId = sender.shareId;
        sender.shareId = null;
        broadcast(room, { type: "sharing-stopped", roomId, peerId: senderId, shareId });
        return;
      }

      if (!directedSignals.has(message.type) || typeof message.targetId !== "string" || typeof message.shareId !== "string") return;
      const target = room.clients.get(message.targetId);
      if (!target || !message.shareId) return;
      if (message.type === "ice-candidate" && !isRecord(message.candidate)) return;
      if ((message.type === "offer" || message.type === "answer") && !isRecord(message.sdp)) return;

      const shareOwner = [...room.clients].find(([, client]) => client.shareId === message.shareId);
      if (!shareOwner) return;
      const [ownerId] = shareOwner;
      if (message.type === "offer" && senderId !== ownerId) return;
      if (message.type === "answer" && message.targetId !== ownerId) return;
      if (message.type === "ice-candidate" && senderId !== ownerId && message.targetId !== ownerId) return;

      const { targetId: _targetId, ...signal } = message;
      send(target.socket, { ...signal, roomId, peerId: senderId });
    } catch {
      // Malformed client messages are intentionally ignored.
    }
  });
});

server.on("listening", () => console.log(`Signaling WebSocket listening on ws://localhost:${port}`));
server.on("error", (error) => console.error("WebSocket server error:", error));
