# TelaLink

Compartilhamento de tela em tempo real para um transmissor e múltiplos espectadores, com React Router, WebRTC nativo e um servidor WebSocket usado exclusivamente para signaling.

## Desenvolvimento

Instale as dependências do frontend e do servidor:

```bash
yarn install
yarn --cwd server install
```

Em dois terminais, inicie o frontend e o servidor de signaling:

```bash
yarn dev
yarn server:dev
```

O frontend fica disponível em `http://localhost:5173` e o WebSocket em `ws://localhost:3001`. O Vite encaminha conexões feitas em `/signal` para o servidor WebSocket, inclusive quando o frontend é acessado por um túnel ngrok.

## Compartilhar pela internet com um comando

Com o [ngrok](https://ngrok.com/download) instalado e autenticado, execute:

```bash
yarn share
```

O comando inicia o frontend, o servidor de signaling e o túnel HTTPS. Ao ficar pronto, ele imprime um link público que já aponta para uma nova sala, por exemplo `https://exemplo.ngrok-free.app/room/uuid-da-sala`. Compartilhe esse endereço e mantenha o terminal aberto. Pressione `Ctrl+C` para encerrar todos os processos.

Para usar outro endereço de signaling, copie `.env.example` para `.env` e defina `VITE_WS_URL`. Em produção, use `wss://` quando a página estiver em HTTPS.

## Como testar

1. Abra o frontend e clique em **Criar sala**.
2. Copie o link e abra-o em duas ou mais janelas ou navegadores.
3. Clique em **Compartilhar tela** em uma das janelas.
4. Escolha uma tela ou janela no seletor do navegador.

O vídeo e o áudio disponível trafegam diretamente do transmissor para cada espectador por WebRTC. O servidor WebSocket elege um único transmissor e encaminha somente ofertas, respostas, candidatos ICE e eventos da sala para os destinatários corretos.

Como cada espectador recebe uma conexão WebRTC própria, não há um limite fixo de participantes no servidor, mas a quantidade prática depende da banda de upload e da capacidade do dispositivo de quem compartilha. Para transmissões muito grandes, use uma SFU.

## Verificações

```bash
yarn typecheck
yarn --cwd server typecheck
yarn build
```
