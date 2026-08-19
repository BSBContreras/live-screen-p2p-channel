import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT) || 3001;
type Membership = { roomId: string; clientId: string };

const rooms = new Map<string, Map<string, WebSocket>>();
const memberships = new WeakMap<WebSocket, Membership>();
const allowedSignals = new Set(["offer", "answer", "ice-candidate", "sharing-stopped"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function send(socket: WebSocket, payload: object) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function leave(socket: WebSocket) {
  const membership = memberships.get(socket);
  if (!membership) return;
  const { roomId, clientId } = membership;
  const room = rooms.get(roomId);
  memberships.delete(socket);
  if (room?.get(clientId) !== socket) return;
  room.delete(clientId);
  room.forEach((peer) => send(peer, { type: "peer-left", roomId }));
  if (!room?.size) rooms.delete(roomId);
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
        const room = rooms.get(roomId) ?? new Map<string, WebSocket>();
        const previousSocket = room.get(clientId);
        if (!previousSocket && room.size >= 2) {
          send(socket, { type: "room-full", roomId });
          return;
        }
        room.set(clientId, socket);
        rooms.set(roomId, room);
        memberships.set(socket, { roomId, clientId });
        previousSocket?.close(1000, "Replaced by a newer connection");
        if (room.size === 2) room.forEach((peer) => send(peer, { type: "peer-joined", roomId }));
        return;
      }

      const membership = memberships.get(socket);
      if (membership?.roomId !== roomId || !allowedSignals.has(message.type)) return;
      if (message.type === "ice-candidate" && !isRecord(message.candidate)) return;
      if ((message.type === "offer" || message.type === "answer") && !isRecord(message.sdp)) return;
      rooms.get(roomId)?.forEach((peer) => {
        if (peer !== socket) send(peer, message);
      });
    } catch {
      // Malformed client messages are intentionally ignored.
    }
  });
});

server.on("listening", () => console.log(`Signaling WebSocket listening on ws://localhost:${port}`));
server.on("error", (error) => console.error("WebSocket server error:", error));
