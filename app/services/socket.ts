export type Participant = {
  id: string;
  name: string;
  shareId: string | null;
};

export type ServerMessage =
  | { type: "room-state"; roomId: string; participants: Participant[] }
  | { type: "participant-joined" | "sharing-started"; roomId: string; participant: Participant }
  | { type: "participant-left"; roomId: string; peerId: string }
  | { type: "sharing-stopped"; roomId: string; peerId: string; shareId: string }
  | { type: "offer" | "answer"; roomId: string; peerId: string; shareId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: string; peerId: string; shareId: string; candidate: RTCIceCandidateInit }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "join-room"; roomId: string; clientId: string; userName: string }
  | { type: "start-sharing" | "sharing-stopped"; roomId: string; shareId: string }
  | { type: "offer" | "answer"; roomId: string; targetId: string; shareId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: string; targetId: string; shareId: string; candidate: RTCIceCandidateInit };

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/signal`;
}

export function createClientId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function createRoomSocket(roomId: string, clientId: string, userName: string) {
  const socket = new WebSocket(getWebSocketUrl());
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join-room", roomId, clientId, userName } satisfies ClientMessage));
  });
  return socket;
}

export function sendSignal(socket: WebSocket | null, message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const serverMessageTypes = new Set([
  "room-state",
  "participant-joined",
  "participant-left",
  "sharing-started",
  "sharing-stopped",
  "offer",
  "answer",
  "ice-candidate",
  "error",
]);

export function parseServerMessage(value: string): ServerMessage | null {
  try {
    const message: unknown = JSON.parse(value);
    if (!message || typeof message !== "object" || !("type" in message)) return null;
    if (serverMessageTypes.has(String((message as { type: unknown }).type))) return message as ServerMessage;
  } catch {
    // Ignore malformed signaling data.
  }
  return null;
}
