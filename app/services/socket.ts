export type ServerMessage =
  | { type: "room-state"; roomId: string; broadcasterId: string | null }
  | { type: "viewer-joined" | "viewer-left" | "sharing-started"; roomId: string; peerId: string }
  | { type: "sharing-stopped" | "sharing-unavailable"; roomId: string }
  | { type: "offer" | "answer"; roomId: string; peerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: string; peerId: string; candidate: RTCIceCandidateInit }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "join-room"; roomId: string; clientId: string }
  | { type: "start-sharing" | "sharing-stopped"; roomId: string }
  | { type: "offer" | "answer"; roomId: string; targetId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: string; targetId: string; candidate: RTCIceCandidateInit };

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/signal`;
}

export function createRoomSocket(roomId: string) {
  const socket = new WebSocket(getWebSocketUrl());
  socket.addEventListener("open", () => {
    const storageKey = "telalink-client-id";
    let clientId = sessionStorage.getItem(storageKey);
    if (!clientId) {
      clientId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
      sessionStorage.setItem(storageKey, clientId);
    }
    socket.send(JSON.stringify({ type: "join-room", roomId, clientId } satisfies ClientMessage));
  });
  return socket;
}

export function sendSignal(socket: WebSocket | null, message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export function parseServerMessage(value: string): ServerMessage | null {
  try {
    const message: unknown = JSON.parse(value);
    if (!message || typeof message !== "object" || !("type" in message)) return null;
    const type = (message as { type: unknown }).type;
    if (["room-state", "viewer-joined", "viewer-left", "sharing-started", "sharing-stopped", "sharing-unavailable", "offer", "answer", "ice-candidate", "error"].includes(String(type))) {
      return message as ServerMessage;
    }
  } catch {
    // Ignore malformed signaling data.
  }
  return null;
}
