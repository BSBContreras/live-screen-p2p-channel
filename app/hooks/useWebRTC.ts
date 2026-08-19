import { useCallback, useEffect, useRef, useState } from "react";
import { createRoomSocket, parseServerMessage, sendSignal } from "../services/socket";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type ConnectionStatus = "connecting" | "waiting" | "sharing" | "connected" | "disconnected" | "error";

export function useWebRTC(roomId: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [broadcasterPresent, setBroadcasterPresent] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const localRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const signalQueue = useRef(Promise.resolve());

  const closePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidates.current.delete(peerId);
    setViewerCount(peersRef.current.size);
  }, []);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidates.current.clear();
    setViewerCount(0);
    setRemoteStream(null);
  }, []);

  const createPeer = useCallback((peerId: string) => {
    const current = peersRef.current.get(peerId);
    if (current && current.signalingState !== "closed") return current;

    const peer = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(peerId, peer);
    setViewerCount(peersRef.current.size);
    localRef.current?.getTracks().forEach((track) => peer.addTrack(track, localRef.current!));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal(socketRef.current, {
          type: "ice-candidate",
          roomId,
          targetId: peerId,
          candidate: candidate.toJSON(),
        });
      }
    };
    peer.ontrack = ({ streams, track }) => {
      setRemoteStream(streams[0] ?? new MediaStream([track]));
      setStatus("connected");
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("connected");
      if (["failed", "closed"].includes(peer.connectionState)) {
        closePeer(peerId);
        setStatus(localRef.current ? "sharing" : "disconnected");
      }
    };
    return peer;
  }, [closePeer, roomId]);

  const makeOffer = useCallback(async (peerId: string) => {
    if (!localRef.current) return;
    const peer = createPeer(peerId);
    if (peer.signalingState !== "stable") return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(socketRef.current, { type: "offer", roomId, targetId: peerId, sdp: offer });
  }, [createPeer, roomId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    const connectTimer = window.setTimeout(() => {
      socket = createRoomSocket(roomId);
      socketRef.current = socket;
      socket.onopen = () => {
        if (localRef.current) {
          setStatus("sharing");
          sendSignal(socket, { type: "start-sharing", roomId });
        } else {
          setStatus("waiting");
        }
      };
      socket.onerror = () => {
        setError("Não foi possível conectar ao servidor de signaling.");
        setStatus("error");
      };
      socket.onclose = () => {
        if (socketRef.current === socket) setStatus("disconnected");
      };
      socket.onmessage = (event) => {
        const message = parseServerMessage(String(event.data));
        if (!message) return;
        signalQueue.current = signalQueue.current.then(async () => {
          if (message.type === "room-state") {
            setBroadcasterPresent(Boolean(message.broadcasterId));
            setStatus("waiting");
          } else if (message.type === "error") {
            setError(message.message);
          } else if (message.type === "sharing-unavailable") {
            const stream = localRef.current;
            localRef.current = null;
            stream?.getTracks().forEach((track) => track.stop());
            setLocalStream(null);
            closeAllPeers();
            setBroadcasterPresent(true);
            setError("Outra pessoa já está compartilhando nesta sala.");
            setStatus("waiting");
          } else if (message.type === "sharing-started") {
            setBroadcasterPresent(true);
            setError(null);
            setStatus(localRef.current ? "sharing" : "waiting");
          } else if (message.type === "viewer-joined") {
            await makeOffer(message.peerId);
          } else if (message.type === "viewer-left") {
            closePeer(message.peerId);
            setStatus(localRef.current && peersRef.current.size ? "connected" : "sharing");
          } else if (message.type === "sharing-stopped") {
            closeAllPeers();
            setBroadcasterPresent(false);
            setStatus("waiting");
          } else if (message.type === "offer") {
            closePeer(message.peerId);
            const peer = createPeer(message.peerId);
            await peer.setRemoteDescription(message.sdp);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal(socketRef.current, { type: "answer", roomId, targetId: message.peerId, sdp: answer });
            for (const candidate of pendingCandidates.current.get(message.peerId) ?? []) {
              await peer.addIceCandidate(candidate);
            }
            pendingCandidates.current.delete(message.peerId);
          } else if (message.type === "answer") {
            const peer = peersRef.current.get(message.peerId);
            if (peer) {
              await peer.setRemoteDescription(message.sdp);
              for (const candidate of pendingCandidates.current.get(message.peerId) ?? []) {
                await peer.addIceCandidate(candidate);
              }
              pendingCandidates.current.delete(message.peerId);
            }
          } else if (message.type === "ice-candidate") {
            const peer = peersRef.current.get(message.peerId);
            if (peer?.remoteDescription) {
              await peer.addIceCandidate(message.candidate);
            } else {
              const candidates = pendingCandidates.current.get(message.peerId) ?? [];
              candidates.push(message.candidate);
              pendingCandidates.current.set(message.peerId, candidates);
            }
          }
        }).catch(() => {
          setError("A negociação da conexão falhou. Tente entrar novamente na sala.");
          setStatus("error");
        });
      };
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
      closeAllPeers();
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
    };
  }, [closeAllPeers, closePeer, createPeer, makeOffer, roomId]);

  const stopSharing = useCallback(() => {
    const stream = localRef.current;
    localRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    closeAllPeers();
    setBroadcasterPresent(false);
    sendSignal(socketRef.current, { type: "sharing-stopped", roomId });
    setStatus("waiting");
  }, [closeAllPeers, roomId]);

  const startSharing = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Este navegador não oferece suporte ao compartilhamento de tela.");
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      localRef.current = stream;
      setLocalStream(stream);
      setBroadcasterPresent(true);
      setStatus("sharing");
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing, { once: true });
      sendSignal(socketRef.current, { type: "start-sharing", roomId });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        setError("O compartilhamento foi cancelado ou não recebeu permissão.");
      } else {
        setError("Não foi possível iniciar o compartilhamento de tela.");
      }
      setStatus("error");
    }
  }, [roomId, stopSharing]);

  return { status, error, localStream, remoteStream, viewerCount, broadcasterPresent, startSharing, stopSharing };
}
