import type { Route } from "./+types/home";
import { useNavigate } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TelaLink — Compartilhe sua tela" },
    { name: "description", content: "Compartilhamento de tela simples e em tempo real." },
  ];
}

export default function Home() {
  const navigate = useNavigate();

  function createRoom() {
    const roomId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    navigate(`/room/${roomId}`);
  }

  return (
    <main className="home-page">
      <section className="hero">
        <div className="brand"><span className="brand-mark">T</span>TelaLink</div>
        <div className="hero-copy">
          <span className="eyebrow">WebRTC • direto entre navegadores</span>
          <h1>Mostre sua tela.<br /><em>Sem complicação.</em></h1>
          <p>Crie uma sala, envie o link e compartilhe em tempo real. Sem cadastro, instalação ou uploads.</p>
          <button className="primary-button" type="button" onClick={createRoom}>
            Criar sala <span aria-hidden="true">→</span>
          </button>
          <small>O vídeo trafega diretamente entre os participantes.</small>
        </div>
        <div className="preview-card" aria-hidden="true">
          <div className="preview-bar"><i /><i /><i /><span>telalink / sua-sala</span></div>
          <div className="preview-screen">
            <div className="preview-window"><b /><b /><b /></div>
            <div className="preview-cursor">↖</div>
          </div>
          <div className="preview-live"><span /> AO VIVO</div>
        </div>
      </section>
      <footer><span>Privado por natureza</span><span>Sem dados armazenados</span><span>Feito com WebRTC</span></footer>
    </main>
  );
}
