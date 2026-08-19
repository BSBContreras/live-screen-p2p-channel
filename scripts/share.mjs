import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { spawn } from "node:child_process";

const FRONTEND_PORT = 5173;
const SIGNALING_PORT = 3001;
const STARTUP_TIMEOUT_MS = 45_000;
const children = [];
let stopping = false;
let ready = false;

function start(name, executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...options,
  });
  const state = { name, child, output: "", exitCode: null, error: null };
  children.push(state);

  const remember = (chunk) => {
    state.output = `${state.output}${chunk}`.slice(-4_000);
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);
  child.on("error", (error) => {
    state.error = error;
  });
  child.on("exit", (code) => {
    state.exitCode = code;
    if (ready && !stopping) {
      console.error(`\n${name} foi encerrado inesperadamente (código ${code ?? "desconhecido"}).`);
      void shutdown(1);
    }
  });
  return state;
}

function startYarn(name, args) {
  if (process.platform === "win32") {
    return start(name, process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `yarn ${args.join(" ")}`]);
  }
  return start(name, "yarn", args);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertRunning() {
  const failed = children.find(({ exitCode, error }) => exitCode !== null || error);
  if (!failed) return;

  const reason = failed.error?.message ?? failed.output.trim() ?? `código ${failed.exitCode}`;
  throw new Error(`${failed.name} não iniciou:\n${reason}`);
}

async function waitFor(label, check) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    assertRunning();
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // O processo ainda pode estar inicializando.
    }
    await delay(250);
  }
  throw new Error(`Tempo esgotado ao aguardar ${label}.`);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function getPublicUrl() {
  const response = await fetch("http://127.0.0.1:4040/api/tunnels");
  if (!response.ok) return null;
  const data = await response.json();
  const tunnel = data.tunnels?.find(
    ({ proto, config }) => proto === "https" && String(config?.addr).includes(`:${FRONTEND_PORT}`),
  );
  return tunnel?.public_url ?? null;
}

async function stopProcess({ child }) {
  if (!child.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      }).once("exit", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled(children.map(stopProcess));
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

async function main() {
  console.log("Iniciando TelaLink, servidor de signaling e ngrok…");

  startYarn("Frontend", ["dev", "--host", "0.0.0.0"]);
  startYarn("Servidor de signaling", ["server:dev"]);
  start("ngrok", "ngrok", ["http", String(FRONTEND_PORT), "--log", "stdout", "--log-format", "json"]);

  const [, , publicUrl] = await Promise.all([
    waitFor("o frontend", () => isPortOpen(FRONTEND_PORT)),
    waitFor("o servidor de signaling", () => isPortOpen(SIGNALING_PORT)),
    waitFor("o túnel do ngrok", getPublicUrl),
  ]);

  const roomUrl = `${publicUrl}/room/${randomUUID()}`;
  ready = true;
  console.log("\nSala pronta:\n");
  console.log(roomUrl);
  console.log("\nCompartilhe esse link. Pressione Ctrl+C para encerrar tudo.\n");

  if (process.argv.includes("--check")) {
    console.log("Verificação concluída; encerrando os processos de teste.");
    await shutdown();
  }
}

main().catch(async (error) => {
  console.error(`\nNão foi possível iniciar o compartilhamento:\n${error.message}`);
  console.error("\nConfirme que o ngrok está instalado e autenticado com: ngrok config add-authtoken SEU_TOKEN");
  await shutdown(1);
});
