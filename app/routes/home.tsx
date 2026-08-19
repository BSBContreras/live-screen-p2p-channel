import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Voyeur — Compartilhe o que está na sua tela" },
    { name: "description", content: "Compartilhamento de tela direto, privado e em tempo real." },
  ];
}

function Brand() {
  return <span className="brand"><span className="brand-mark">V</span><span>VOYEUR</span></span>;
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        element.classList.add("is-visible");
        observer.disconnect();
      }
    }, { threshold: 0.18 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}

export default function Home() {
  const navigate = useNavigate();

  function createRoom() {
    const roomId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    navigate(`/room/${roomId}`);
  }

  return (
    <main className="home-page">
      <header className="site-header">
        <Brand />
        <span className="header-meta">SCREEN TRANSMISSION / P2P</span>
        <button className="text-action" type="button" onClick={createRoom}>ABRIR UMA SALA <span>↗</span></button>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-index"><span>01 / SINAL ABERTO</span><span>AO VIVO · PRIVADO</span></div>
        <Reveal className="hero-copy">
          <h1 id="hero-title">MOSTRE<br />SUA <em>TELA.</em></h1>
          <div className="hero-note">
            <p>Crie uma sala, envie o link e compartilhe em tempo real. Sem cadastro, instalação ou uploads.</p>
            <button className="primary-button" type="button" onClick={createRoom}>CRIAR SALA <span aria-hidden="true">→</span></button>
          </div>
        </Reveal>

        <Reveal className="signal-frame">
          <div className="signal-topline"><span>VYR / LIVE FEED</span><span>00:00:01</span></div>
          <div className="signal-screen">
            <div className="screen-noise" />
            <div className="signal-window">
              <span className="window-bar">VOYEUR / SUA-SALA</span>
              <div className="window-content"><i /><i /><i /></div>
            </div>
            <span className="live-indicator"><i /> TRANSMITINDO</span>
          </div>
          <div className="signal-footer"><span>WEBRTC / ENCRYPTED</span><span>1920 × 1080</span></div>
        </Reveal>

        <div className="scroll-cue"><span>SCROLL PARA EXPLORAR</span><i /></div>
      </section>

      <section className="chapter privacy-chapter">
        <Reveal className="chapter-grid">
          <div className="section-label">02 / O QUE PASSA<br />FICA ENTRE VOCÊS</div>
          <div className="statement">
            <p className="statement-kicker">PRIVADO POR NATUREZA</p>
            <h2>SEM PALCO.<br /><span>SEM ARQUIVO.</span><br />SÓ O AGORA.</h2>
          </div>
          <p className="chapter-copy">O vídeo trafega diretamente entre os participantes. A Voyeur conecta as pessoas à sala — não guarda o que elas compartilham.</p>
        </Reveal>
      </section>

      <section className="chapter how-chapter">
        <Reveal>
          <div className="chapter-heading">
            <span className="section-label">03 / RITUAL DE ENTRADA</span>
            <h2>TRÊS GESTOS.<br />UM SINAL.</h2>
          </div>
          <ol className="steps">
            <li><span>01</span><strong>CRIE</strong><p>Uma sala nasce em um clique. Sem conta, sem configuração.</p></li>
            <li><span>02</span><strong>CONVIDE</strong><p>Envie o link para até oito pessoas entrarem.</p></li>
            <li><span>03</span><strong>TRANSMITA</strong><p>Todos podem compartilhar suas telas simultaneamente.</p></li>
          </ol>
        </Reveal>
      </section>

      <section className="chapter closing-chapter">
        <Reveal>
          <span className="section-label">04 / CANAL PRONTO</span>
          <h2>O QUE VOCÊ<br />QUER <em>MOSTRAR?</em></h2>
          <button className="closing-action" type="button" onClick={createRoom}>INICIAR TRANSMISSÃO <span>→</span></button>
        </Reveal>
      </section>

      <footer className="site-footer">
        <Brand />
        <span>SEM DADOS ARMAZENADOS</span>
        <span>FEITO COM WEBRTC</span>
        <span>© 2026 / BRASIL</span>
      </footer>
    </main>
  );
}
