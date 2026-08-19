import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT) || 3001;
type Membership = { roomId: string; clientId: string };
type Room = { clients: Map<string, WebSocket>; broadcasterId: string | null };

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
  room.clients.forEach((peer, clientId) => {
    if (clientId !== exceptClientId) send(peer, payload);
  });
}

function leave(socket: WebSocket) {
  const membership = memberships.get(socket);
  if (!membership) return;
  const { roomId, clientId } = membership;
  const room = rooms.get(roomId);
  memberships.delete(socket);
  if (!room || room.clients.get(clientId) !== socket) return;

  room.clients.delete(clientId);
  if (room.broadcasterId === clientId) {
    room.broadcasterId = null;
    broadcast(room, { type: "sharing-stopped", roomId });
  } else if (room.broadcasterId) {
    const broadcaster = room.clients.get(room.broadcasterId);
    if (broadcaster) send(broadcaster, { type: "viewer-left", roomId, peerId: clientId });
  }
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
        const clientId = message.clientId;
        const room = rooms.get(roomId) ?? { clients: new Map<string, WebSocket>(), broadcasterId: null };
        const previousSocket = room.clients.get(clientId);
        room.clients.set(clientId, socket);
        rooms.set(roomId, room);
        memberships.set(socket, { roomId, clientId });
        previousSocket?.close(1000, "Replaced by a newer connection");
        send(socket, { type: "room-state", roomId, broadcasterId: room.broadcasterId });
        if (room.broadcasterId && room.broadcasterId !== clientId) {
          const broadcaster = room.clients.get(room.broadcasterId);
          if (broadcaster) send(broadcaster, { type: "viewer-joined", roomId, peerId: clientId });
        }
        return;
      }

      const membership = memberships.get(socket);
      const room = rooms.get(roomId);
      if (membership?.roomId !== roomId || !room) return;
      const senderId = membership.clientId;

      if (message.type === "start-sharing") {
        if (room.broadcasterId && room.broadcasterId !== senderId) {
          send(socket, { type: "sharing-unavailable", roomId });
          return;
        }
        room.broadcasterId = senderId;
        send(socket, { type: "sharing-started", roomId, peerId: senderId });
        room.clients.forEach((peer, clientId) => {
          if (clientId === senderId) return;
          send(peer, { type: "sharing-started", roomId, peerId: senderId });
          send(socket, { type: "viewer-joined", roomId, peerId: clientId });
        });
        return;
      }

      if (message.type === "sharing-stopped") {
        if (room.broadcasterId !== senderId) return;
        room.broadcasterId = null;
        broadcast(room, { type: "sharing-stopped", roomId });
        return;
      }

      if (!directedSignals.has(message.type) || typeof message.targetId !== "string") return;
      if (message.type === "ice-candidate" && !isRecord(message.candidate)) return;
      if ((message.type === "offer" || message.type === "answer") && !isRecord(message.sdp)) return;
      if (message.type === "offer" && room.broadcasterId !== senderId) return;
      if (message.type === "answer" && message.targetId !== room.broadcasterId) return;
      if (message.type === "ice-candidate" && senderId !== room.broadcasterId && message.targetId !== room.broadcasterId) return;
      const target = room.clients.get(message.targetId);
      if (!target) return;
      const { targetId: _targetId, ...signal } = message;
      send(target, { ...signal, roomId, peerId: senderId });
    } catch {
      // Malformed client messages are intentionally ignored.
    }
  });
});

server.on("listening", () => console.log(`Signaling WebSocket listening on ws://localhost:${port}`));
server.on("error", (error) => console.error("WebSocket server error:", error));
