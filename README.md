# TelaLink

Compartilhamento de tela em tempo real para salas com até oito participantes, onde qualquer pessoa pode transmitir simultaneamente, usando React Router, WebRTC nativo e um servidor WebSocket exclusivamente para signaling.

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
2. Informe um nome para entrar, copie o link e abra-o em outras janelas ou navegadores.
3. Entre com um nome em cada janela.
4. Clique em **Compartilhar tela** em duas ou mais janelas.
5. Escolha uma tela ou janela no seletor de cada navegador.

O vídeo e o áudio disponível trafegam diretamente entre os participantes por WebRTC. O servidor WebSocket mantém apenas a presença temporária da sala e encaminha ofertas, respostas, candidatos ICE e eventos aos destinatários corretos. Cada transmissão aparece em um mosaico, com áudio remoto inicialmente silenciado e controle individual.

Cada pessoa que compartilha cria uma conexão WebRTC para cada outro participante. Por isso, a sala é limitada a oito pessoas e a capacidade prática ainda depende da banda de upload e do dispositivo de cada transmissor. Para salas maiores, use uma SFU.

## Verificações

```bash
yarn typecheck
yarn --cwd server typecheck
yarn build
```
