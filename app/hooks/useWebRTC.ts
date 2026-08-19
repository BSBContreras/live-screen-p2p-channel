import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRoomSocket,
  createClientId,
  parseServerMessage,
  sendSignal,
  type Participant,
} from "../services/socket";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type AudioAwareDisplayMediaOptions = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "window" | "system";
};

const DISPLAY_MEDIA_OPTIONS: AudioAwareDisplayMediaOptions = {
  video: { displaySurface: "window" },
  audio: true,
  systemAudio: "exclude",
  windowAudio: "window",
};

function removeUnsafeSystemAudio(stream: MediaStream) {
  const displaySurface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
  if (displaySurface !== "monitor") return;

  stream.getAudioTracks().forEach((track) => {
    track.stop();
    stream.removeTrack(track);
  });
}

type RemoteStream = { shareId: string; participantId: string; stream: MediaStream };
type IncomingPeer = { peer: RTCPeerConnection; participantId: string };

export type SharedScreen = {
  participantId: string;
  shareId: string;
  name: string;
  stream: MediaStream | null;
  isLocal: boolean;
};

export type ConnectionStatus = "connecting" | "waiting" | "sharing" | "connected" | "disconnected" | "error";

export function useWebRTC(roomId: string, userName: string) {
  const clientIdRef = useRef(createClientId());
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localShareIdRef = useRef<string | null>(null);
  const outgoingPeersRef = useRef(new Map<string, RTCPeerConnection>());
  const incomingPeersRef = useRef(new Map<string, IncomingPeer>());
  const pendingOutgoingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const pendingIncomingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const signalQueue = useRef(Promise.resolve());

  const commitParticipants = useCallback((update: (current: Participant[]) => Participant[]) => {
    const next = update(participantsRef.current);
    participantsRef.current = next;
    setParticipants(next);
  }, []);

  const closeOutgoingPeer = useCallback((participantId: string) => {
    outgoingPeersRef.current.get(participantId)?.close();
    outgoingPeersRef.current.delete(participantId);
    pendingOutgoingCandidates.current.delete(participantId);
  }, []);

  const closeIncomingPeer = useCallback((shareId: string) => {
    incomingPeersRef.current.get(shareId)?.peer.close();
    incomingPeersRef.current.delete(shareId);
    pendingIncomingCandidates.current.delete(shareId);
    setRemoteStreams((current) => current.filter((item) => item.shareId !== shareId));
  }, []);

  const closeAllConnections = useCallback(() => {
    outgoingPeersRef.current.forEach((peer) => peer.close());
    incomingPeersRef.current.forEach(({ peer }) => peer.close());
    outgoingPeersRef.current.clear();
    incomingPeersRef.current.clear();
    pendingOutgoingCandidates.current.clear();
    pendingIncomingCandidates.current.clear();
    setRemoteStreams([]);
  }, []);

  const createOutgoingOffer = useCallback(async (participantId: string, shareId: string) => {
    const stream = localStreamRef.current;
    if (!stream || localShareIdRef.current !== shareId || participantId === clientIdRef.current) return;

    closeOutgoingPeer(participantId);
    const peer = new RTCPeerConnection(RTC_CONFIG);
    outgoingPeersRef.current.set(participantId, peer);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate && localShareIdRef.current === shareId) {
        sendSignal(socketRef.current, {
          type: "ice-candidate",
          roomId,
          targetId: participantId,
          shareId,
          candidate: candidate.toJSON(),
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) closeOutgoingPeer(participantId);
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(socketRef.current, { type: "offer", roomId, targetId: participantId, shareId, sdp: offer });
  }, [closeOutgoingPeer, roomId]);

  const createIncomingAnswer = useCallback(async (participantId: string, shareId: string, sdp: RTCSessionDescriptionInit) => {
    closeIncomingPeer(shareId);
    const peer = new RTCPeerConnection(RTC_CONFIG);
    incomingPeersRef.current.set(shareId, { peer, participantId });
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal(socketRef.current, {
          type: "ice-candidate",
          roomId,
          targetId: participantId,
          shareId,
          candidate: candidate.toJSON(),
        });
      }
    };
    peer.ontrack = ({ streams, track }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      setRemoteStreams((current) => [
        ...current.filter((item) => item.shareId !== shareId),
        { shareId, participantId, stream },
      ]);
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState) && incomingPeersRef.current.get(shareId)?.peer === peer) {
        closeIncomingPeer(shareId);
      }
    };

    await peer.setRemoteDescription(sdp);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    sendSignal(socketRef.current, { type: "answer", roomId, targetId: participantId, shareId, sdp: answer });
    for (const candidate of pendingIncomingCandidates.current.get(shareId) ?? []) {
      await peer.addIceCandidate(candidate);
    }
    pendingIncomingCandidates.current.delete(shareId);
  }, [closeIncomingPeer, roomId]);

  useEffect(() => {
    const socket = createRoomSocket(roomId, clientIdRef.current, userName);
    socketRef.current = socket;
    socket.onopen = () => setStatus("connecting");
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
          participantsRef.current = message.participants;
          setParticipants(message.participants);
          setError(null);
          setStatus(localStreamRef.current ? "sharing" : "connected");
        } else if (message.type === "error") {
          setError(message.message);
          setStatus("error");
        } else if (message.type === "participant-joined") {
          commitParticipants((current) => [...current.filter((item) => item.id !== message.participant.id), message.participant]);
          const shareId = localShareIdRef.current;
          if (shareId) await createOutgoingOffer(message.participant.id, shareId);
        } else if (message.type === "participant-left") {
          commitParticipants((current) => current.filter((item) => item.id !== message.peerId));
          closeOutgoingPeer(message.peerId);
          for (const [shareId, incoming] of incomingPeersRef.current) {
            if (incoming.participantId === message.peerId) closeIncomingPeer(shareId);
          }
        } else if (message.type === "sharing-started") {
          const updated = [
            ...participantsRef.current.filter((item) => item.id !== message.participant.id),
            message.participant,
          ];
          participantsRef.current = updated;
          setParticipants(updated);
          setError(null);
          if (message.participant.id === clientIdRef.current) {
            setStatus("sharing");
            await Promise.all(updated.map((item) => createOutgoingOffer(item.id, message.participant.shareId!)));
          }
        } else if (message.type === "sharing-stopped") {
          commitParticipants((current) => current.map((item) =>
            item.id === message.peerId && item.shareId === message.shareId ? { ...item, shareId: null } : item,
          ));
          closeIncomingPeer(message.shareId);
          if (message.peerId === clientIdRef.current) setStatus("connected");
        } else if (message.type === "offer") {
          await createIncomingAnswer(message.peerId, message.shareId, message.sdp);
        } else if (message.type === "answer") {
          const peer = outgoingPeersRef.current.get(message.peerId);
          if (peer && localShareIdRef.current === message.shareId) {
            await peer.setRemoteDescription(message.sdp);
            for (const candidate of pendingOutgoingCandidates.current.get(message.peerId) ?? []) {
              await peer.addIceCandidate(candidate);
            }
            pendingOutgoingCandidates.current.delete(message.peerId);
          }
        } else if (message.type === "ice-candidate") {
          if (localShareIdRef.current === message.shareId) {
            const peer = outgoingPeersRef.current.get(message.peerId);
            if (peer?.remoteDescription) {
              await peer.addIceCandidate(message.candidate);
            } else {
              const candidates = pendingOutgoingCandidates.current.get(message.peerId) ?? [];
              candidates.push(message.candidate);
              pendingOutgoingCandidates.current.set(message.peerId, candidates);
            }
          } else {
            const peer = incomingPeersRef.current.get(message.shareId)?.peer;
            if (peer?.remoteDescription) {
              await peer.addIceCandidate(message.candidate);
            } else {
              const candidates = pendingIncomingCandidates.current.get(message.shareId) ?? [];
              candidates.push(message.candidate);
              pendingIncomingCandidates.current.set(message.shareId, candidates);
            }
          }
        }
      }).catch(() => {
        setError("Uma das transmissões não conseguiu estabelecer conexão.");
      });
    };

    return () => {
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
      closeAllConnections();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      localShareIdRef.current = null;
    };
  }, [closeAllConnections, closeIncomingPeer, closeOutgoingPeer, commitParticipants, createIncomingAnswer, createOutgoingOffer, roomId, userName]);

  const stopSharing = useCallback(() => {
    const stream = localStreamRef.current;
    const shareId = localShareIdRef.current;
    localStreamRef.current = null;
    localShareIdRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    outgoingPeersRef.current.forEach((_, participantId) => closeOutgoingPeer(participantId));
    if (shareId) {
      commitParticipants((current) => current.map((item) =>
        item.id === clientIdRef.current ? { ...item, shareId: null } : item,
      ));
      sendSignal(socketRef.current, { type: "sharing-stopped", roomId, shareId });
    }
    setStatus(socketRef.current?.readyState === WebSocket.OPEN ? "connected" : "disconnected");
  }, [closeOutgoingPeer, commitParticipants, roomId]);

  const startSharing = useCallback(async () => {
    setError(null);
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("A conexão com a sala ainda não está pronta.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Este navegador não oferece suporte ao compartilhamento de tela.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(DISPLAY_MEDIA_OPTIONS);
      removeUnsafeSystemAudio(stream);
      const shareId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
      localStreamRef.current = stream;
      localShareIdRef.current = shareId;
      setLocalStream(stream);
      commitParticipants((current) => current.map((item) =>
        item.id === clientIdRef.current ? { ...item, shareId } : item,
      ));
      setStatus("sharing");
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing, { once: true });
      sendSignal(socketRef.current, { type: "start-sharing", roomId, shareId });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        setError("O compartilhamento foi cancelado ou não recebeu permissão.");
      } else {
        setError("Não foi possível iniciar o compartilhamento de tela.");
      }
    }
  }, [commitParticipants, roomId, stopSharing]);

  const shares = useMemo<SharedScreen[]>(() => participants
    .filter((item): item is Participant & { shareId: string } => Boolean(item.shareId))
    .map((item) => ({
      participantId: item.id,
      shareId: item.shareId,
      name: item.name,
      stream: item.id === clientIdRef.current
        ? localStream
        : remoteStreams.find((remote) => remote.shareId === item.shareId)?.stream ?? null,
      isLocal: item.id === clientIdRef.current,
    })), [localStream, participants, remoteStreams]);

  const waitingParticipants = useMemo(() => participants.filter((item) => !item.shareId), [participants]);

  return {
    status,
    error,
    shares,
    waitingParticipants,
    participantCount: participants.length,
    localStream,
    localParticipantId: clientIdRef.current,
    startSharing,
    stopSharing,
  };
}
