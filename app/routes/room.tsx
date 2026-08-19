import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/room";
import { useWebRTC, type ConnectionStatus, type SharedScreen } from "../hooks/useWebRTC";

const NAME_STORAGE_KEY = "telalink-user-name";
const MAX_NAME_LENGTH = 50;

const labels: Record<ConnectionStatus, string> = {
  connecting: "Conectando",
  waiting: "Na sala",
  sharing: "Compartilhando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro na conexão",
};

export function meta() {
  return [{ title: "Sala de compartilhamento — TelaLink" }];
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function ShareTile({ share }: { share: SharedScreen }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLElement>(null);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !share.stream) return;
    video.srcObject = share.stream;
    void video.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    return () => {
      if (video.srcObject === share.stream) video.srcObject = null;
    };
  }, [share.stream]);

  useEffect(() => {
    function syncFullscreen() {
      setIsFullscreen(document.fullscreenElement === tileRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await tileRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by browser or operating-system policy.
    }
  }

  async function resumePlayback() {
    try {
      await videoRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }

  const hasAudio = Boolean(share.stream?.getAudioTracks().length);

  return (
    <article className="share-tile" ref={tileRef}>
      <div className="share-media">
        {share.stream ? (
          <video ref={videoRef} autoPlay playsInline muted={share.isLocal || muted} />
        ) : (
          <div className="tile-loading"><span /><p>Conectando à transmissão…</p></div>
        )}
        {playbackBlocked && share.stream && (
          <button className="playback-button" type="button" onClick={resumePlayback}>▶ Reproduzir</button>
        )}
      </div>
      <div className="share-toolbar">
        <div className="share-owner">
          <span className="participant-avatar small">{initials(share.name)}</span>
          <strong>{share.name}</strong>
          {share.isLocal && <span className="you-badge">Sua tela</span>}
        </div>
        <div className="tile-actions">
          {!share.isLocal && (
            <button
              type="button"
              onClick={() => setMuted((current) => !current)}
              disabled={!hasAudio}
              aria-label={!hasAudio ? "Transmissão sem áudio" : muted ? "Ativar áudio" : "Silenciar áudio"}
              title={!hasAudio ? "Sem áudio" : muted ? "Ativar áudio" : "Silenciar"}
            >
              {!hasAudio ? "Sem áudio" : muted ? "Som desligado" : "Som ligado"}
            </button>
          )}
          <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}>
            {isFullscreen ? "Sair" : "Tela cheia"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ActiveRoom({ roomId, userName }: { roomId: string; userName: string }) {
  const {
    status,
    error,
    shares,
    waitingParticipants,
    participantCount,
    localStream,
    localParticipantId,
    startSharing,
    stopSharing,
  } = useWebRTC(roomId, userName);
  const [copied, setCopied] = useState(false);
  const [roomUrl, setRoomUrl] = useState(roomId);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    setRoomUrl(url.toString());
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(roomUrl);
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
          <div>
            <span className="eyebrow">SALA ATIVA · {participantCount}/8 PARTICIPANTES</span>
            <h1>Compartilhamentos da sala</h1>
            <p>Qualquer participante pode compartilhar sua tela ao mesmo tempo.</p>
          </div>
          <div className="room-actions">
            {localStream ? (
              <button className="danger-button" type="button" onClick={stopSharing}>Parar compartilhamento</button>
            ) : (
              <button className="primary-button" type="button" onClick={startSharing} disabled={status === "connecting" || status === "disconnected"}>
                Compartilhar tela <span>▣</span>
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}

        <div className="room-layout">
          <section className={`share-grid ${shares.length === 1 ? "single-share" : ""}`} aria-label="Telas compartilhadas">
            {shares.length ? shares.map((share) => <ShareTile key={share.shareId} share={share} />) : (
              <div className="empty-grid">
                <div className="screen-icon">▣</div>
                <h2>Nenhuma tela compartilhada</h2>
                <p>Use “Compartilhar tela” para iniciar ou aguarde outro participante.</p>
              </div>
            )}
          </section>

          <aside className="participants-panel">
            <div className="participants-heading">
              <div><span className="online-dot" /><strong>Na sala</strong></div>
              <span>{waitingParticipants.length}</span>
            </div>
            <p className="participants-description">Participantes que não estão compartilhando.</p>
            <div className="participant-list">
              {waitingParticipants.length ? waitingParticipants.map((participant) => (
                <div className="participant-row" key={participant.id}>
                  <span className="participant-avatar">{initials(participant.name)}</span>
                  <span>{participant.name}</span>
                  {participant.id === localParticipantId && <small>Você</small>}
                </div>
              )) : <p className="empty-participants">Todos estão compartilhando.</p>}
            </div>
          </aside>
        </div>

        <div className="invite-card">
          <div><span className="invite-icon">↗</span><div><b>Convide pessoas para esta sala</b><p>Até oito pessoas podem entrar e compartilhar simultaneamente.</p></div></div>
          <div className="link-field"><span>{roomUrl}</span><button type="button" onClick={copyLink}>{copied ? "Copiado!" : "Copiar link"}</button></div>
        </div>
      </section>
    </main>
  );
}

export default function Room({ params }: Route.ComponentProps) {
  const { roomId } = params;
  const [name, setName] = useState("");
  const [enteredName, setEnteredName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => setName(sessionStorage.getItem(NAME_STORAGE_KEY) ?? ""), []);

  function enterRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setNameError("Digite seu nome para entrar na sala.");
      return;
    }
    if (normalizedName.length > MAX_NAME_LENGTH) {
      setNameError(`Use no máximo ${MAX_NAME_LENGTH} caracteres.`);
      return;
    }
    sessionStorage.setItem(NAME_STORAGE_KEY, normalizedName);
    setNameError(null);
    setEnteredName(normalizedName);
  }

  if (enteredName) return <ActiveRoom roomId={roomId} userName={enteredName} />;

  return (
    <main className="room-page room-locked">
      <header className="room-header">
        <Link className="brand" to="/"><span className="brand-mark">T</span>TelaLink</Link>
        <div className="status-pill"><span />Aguardando entrada</div>
      </header>
      <section className="room-content locked-content" aria-hidden="true">
        <div className="room-heading"><div><span className="eyebrow">SALA</span><h1>Compartilhamentos da sala</h1><p>Entre para ver quem está compartilhando.</p></div></div>
        <div className="locked-preview"><div className="screen-icon">▣</div></div>
      </section>
      <div className="join-backdrop">
        <form className="join-dialog" onSubmit={enterRoom} role="dialog" aria-modal="true" aria-labelledby="join-title">
          <span className="brand-mark">T</span>
          <span className="eyebrow">ENTRAR NA SALA</span>
          <h1 id="join-title">Como devemos chamar você?</h1>
          <p>Seu nome ficará visível para as outras pessoas desta sala.</p>
          <label htmlFor="participant-name">Seu nome</label>
          <input
            id="participant-name"
            value={name}
            onChange={(event) => { setName(event.target.value); setNameError(null); }}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="name"
            autoFocus
            placeholder="Digite seu nome"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "name-error" : undefined}
          />
          {nameError && <span className="field-error" id="name-error" role="alert">{nameError}</span>}
          <button className="primary-button" type="submit">Entrar na sala <span>→</span></button>
          <small>Até 8 participantes · conexão direta entre navegadores</small>
        </form>
      </div>
    </main>
  );
}
