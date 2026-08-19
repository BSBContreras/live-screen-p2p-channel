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
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peerPresentRef = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const signalQueue = useRef(Promise.resolve());

  const closePeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidates.current = [];
    setRemoteStream(null);
  }, []);

  const createPeer = useCallback(() => {
    if (peerRef.current && peerRef.current.signalingState !== "closed") return peerRef.current;
    const peer = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = peer;
    localRef.current?.getTracks().forEach((track) => peer.addTrack(track, localRef.current!));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(socketRef.current, { type: "ice-candidate", roomId, candidate: candidate.toJSON() });
    };
    peer.ontrack = ({ streams, track }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      setRemoteStream(stream);
      setStatus("connected");
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("connected");
      if (["failed", "disconnected"].includes(peer.connectionState)) setStatus("disconnected");
    };
    return peer;
  }, [roomId]);

  const makeOffer = useCallback(async () => {
    if (!localRef.current || !peerPresentRef.current) return;
    const peer = createPeer();
    if (peer.signalingState !== "stable") return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(socketRef.current, { type: "offer", roomId, sdp: offer });
  }, [createPeer, roomId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    const connectTimer = window.setTimeout(() => {
      socket = createRoomSocket(roomId);
      socketRef.current = socket;
      socket.onopen = () => setStatus("waiting");
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
        if (message.type === "room-full") {
          setError("Esta sala já tem dois participantes.");
          setStatus("error");
        } else if (message.type === "error") {
          setError(message.message);
        } else if (message.type === "peer-joined") {
          peerPresentRef.current = true;
          setError(null);
          setStatus(localRef.current ? "sharing" : "waiting");
          await makeOffer();
        } else if (message.type === "peer-left") {
          peerPresentRef.current = false;
          closePeer();
          setStatus(localRef.current ? "sharing" : "waiting");
        } else if (message.type === "sharing-stopped") {
          closePeer();
          setStatus("waiting");
        } else if (message.type === "offer") {
          closePeer();
          const peer = createPeer();
          await peer.setRemoteDescription(message.sdp);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal(socketRef.current, { type: "answer", roomId, sdp: answer });
          for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
        } else if (message.type === "answer") {
          const peer = peerRef.current;
          if (peer) {
            await peer.setRemoteDescription(message.sdp);
            for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
          }
        } else if (message.type === "ice-candidate") {
          const peer = peerRef.current;
          if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate);
          else pendingCandidates.current.push(message.candidate);
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
      closePeer();
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
    };
  }, [closePeer, createPeer, makeOffer, roomId]);

  const stopSharing = useCallback(() => {
    const stream = localRef.current;
    localRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    closePeer();
    sendSignal(socketRef.current, { type: "sharing-stopped", roomId });
    setStatus("waiting");
  }, [closePeer, roomId]);

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
      setStatus("sharing");
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing, { once: true });
      await makeOffer();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        setError("O compartilhamento foi cancelado ou não recebeu permissão.");
      } else {
        setError("Não foi possível iniciar o compartilhamento de tela.");
      }
      setStatus("error");
    }
  }, [makeOffer, stopSharing]);

  return { status, error, localStream, remoteStream, startSharing, stopSharing };
}
