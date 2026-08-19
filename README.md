# TelaLink

MVP de compartilhamento de tela em tempo real com React Router, WebRTC nativo e um servidor WebSocket usado exclusivamente para signaling.

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

Para usar outro endereço de signaling, copie `.env.example` para `.env` e defina `VITE_WS_URL`. Em produção, use `wss://` quando a página estiver em HTTPS.

## Como testar

1. Abra o frontend e clique em **Criar sala**.
2. Copie o link e abra-o em outra janela ou navegador.
3. Clique em **Compartilhar tela** em uma das janelas.
4. Escolha uma tela ou janela no seletor do navegador.

O vídeo e o áudio disponível trafegam diretamente entre os dois navegadores por WebRTC. O servidor WebSocket retransmite somente ofertas, respostas, candidatos ICE e eventos da sala.

## Verificações

```bash
yarn typecheck
yarn --cwd server typecheck
yarn build
```
