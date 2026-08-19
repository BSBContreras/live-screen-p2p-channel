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
  const { status, error, localStream, remoteStream, startSharing, stopSharing } = useWebRTC(roomId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const visibleStream = remoteStream ?? localStream;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = visibleStream;
  }, [visibleStream]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="room-page">
      <header className="room-header">
        <Link className="brand" to="/"><span className="brand-mark">T</span>TelaLink</Link>
        <div className={`status-pill status-${status}`}><span />{labels[status]}</div>
      </header>

      <section className="room-content">
        <div className="room-heading">
          <div><span className="eyebrow">SALA ATIVA</span><h1>Sua sala de compartilhamento</h1><p>Convide uma pessoa e comece a apresentar quando estiver pronto.</p></div>
          <div className="room-actions">
            {localStream ? (
              <button className="danger-button" type="button" onClick={stopSharing}>Parar compartilhamento</button>
            ) : (
              <button className="primary-button" type="button" onClick={startSharing}>Compartilhar tela <span>▣</span></button>
            )}
          </div>
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}

        <div className="video-shell">
          {visibleStream ? (
            <video ref={videoRef} autoPlay playsInline muted={Boolean(localStream && !remoteStream)} />
          ) : (
            <div className="empty-video"><div className="screen-icon">▣</div><h2>A tela compartilhada aparecerá aqui</h2><p>{status === "waiting" ? "Aguardando alguém iniciar o compartilhamento." : "Preparando a conexão segura…"}</p></div>
          )}
          {localStream && !remoteStream && <span className="local-badge">SUA TELA</span>}
        </div>

        <div className="invite-card">
          <div><span className="invite-icon">↗</span><div><b>Convide alguém para esta sala</b><p>Compartilhe o link abaixo. A sala suporta duas pessoas neste MVP.</p></div></div>
          <div className="link-field"><span>{typeof window !== "undefined" ? window.location.href : roomId}</span><button type="button" onClick={copyLink}>{copied ? "Copiado!" : "Copiar link"}</button></div>
        </div>
      </section>
    </main>
  );
}
