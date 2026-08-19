import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/room";
import { useWebRTC, type ConnectionStatus } from "../hooks/useWebRTC";

const labels: Record<ConnectionStatus, string> = {
  connecting: "Conectando",
  waiting: "Aguardando participante",
  sharing: "Compartilhando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro na conexão",
};

export function meta() {
  return [{ title: "Sala de compartilhamento — TelaLink" }];
}

export default function Room({ params }: Route.ComponentProps) {
  const { roomId } = params;
  const { status, error, localStream, remoteStream, viewerCount, broadcasterPresent, startSharing, stopSharing } = useWebRTC(roomId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [roomUrl, setRoomUrl] = useState(roomId);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const visibleStream = remoteStream ?? localStream;

  useEffect(() => setRoomUrl(window.location.href), []);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === videoShellRef.current);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !visibleStream) return;
    video.srcObject = visibleStream;
    void video.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => setPlaybackBlocked(true));
  }, [visibleStream]);

  async function resumePlayback() {
    try {
      await videoRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function toggleFullscreen() {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await videoShellRef.current?.requestFullscreen();
      }
    } catch {
      setFullscreenError("Não foi possível abrir a transmissão em tela cheia.");
    }
  }

  return (
    <main className="room-page">
      <header className="room-header">
        <Link className="brand" to="/"><span className="brand-mark">T</span>TelaLink</Link>
        <div className={`status-pill status-${status}`}><span />{labels[status]}</div>
      </header>

      <section className="room-content">
        <div className="room-heading">
          <div><span className="eyebrow">SALA ATIVA</span><h1>Sua sala de compartilhamento</h1><p>Uma pessoa apresenta e várias podem assistir ao mesmo tempo.</p></div>
          <div className="room-actions">
            {localStream ? (
              <button className="danger-button" type="button" onClick={stopSharing}>Parar compartilhamento</button>
            ) : !broadcasterPresent ? (
              <button className="primary-button" type="button" onClick={startSharing}>Compartilhar tela <span>▣</span></button>
            ) : null}
          </div>
        </div>

        {(error || fullscreenError) && <div className="error-message" role="alert">{error ?? fullscreenError}</div>}

        <div className="video-shell" ref={videoShellRef}>
          {visibleStream ? (
            <video ref={videoRef} autoPlay playsInline muted={Boolean(localStream)} />
          ) : (
            <div className="empty-video"><div className="screen-icon">▣</div><h2>A tela compartilhada aparecerá aqui</h2><p>{status === "waiting" ? "Aguardando alguém iniciar o compartilhamento." : "Preparando a conexão segura…"}</p></div>
          )}
          {localStream && !remoteStream && <span className="local-badge">SUA TELA</span>}
          {localStream && <span className="viewer-count">{viewerCount} {viewerCount === 1 ? "espectador" : "espectadores"}</span>}
          {visibleStream && (
            <button
              className="fullscreen-button"
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              <span aria-hidden="true">{isFullscreen ? "×" : "⛶"}</span>
              {isFullscreen ? "Sair" : "Tela cheia"}
            </button>
          )}
          {remoteStream && playbackBlocked && (
            <button className="playback-button" type="button" onClick={resumePlayback}>
              <span aria-hidden="true">▶</span> Reproduzir transmissão
            </button>
          )}
        </div>

        <div className="invite-card">
          <div><span className="invite-icon">↗</span><div><b>Convide pessoas para esta sala</b><p>Compartilhe o link abaixo. Uma pessoa transmite e múltiplas pessoas podem assistir.</p></div></div>
          <div className="link-field"><span>{roomUrl}</span><button type="button" onClick={copyLink}>{copied ? "Copiado!" : "Copiar link"}</button></div>
        </div>
      </section>
    </main>
  );
}
