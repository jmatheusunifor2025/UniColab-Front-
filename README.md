<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2334f9e7-2f34-43af-b704-6116d7aec7e3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy

Quem faz o build é o GitHub Actions (`.github/workflows/deploy.yml`). O Dokploy só implanta a imagem pronta. A cada merge na `main`:

1. O Actions compila a imagem Docker com `VITE_API_URL=https://unicolab-api.thebylito.dev`.
2. Publica no GHCR: `ghcr.io/jmatheusunifor2025/unicolab-front:sha-<commit>` (e `:latest`). O pacote fica público.
3. Chama o Dokploy (`nodilabs/dokploy-deploy-action`) para implantar essa versão.

O container escuta na porta **3001**. O site fica em `https://unicolab.thebylito.dev`.

`VITE_API_URL` entra no build. `GEMINI_API_KEY` é opcional e, se existir, fica só nas variáveis de ambiente do Dokploy.

No GitHub (Settings → Secrets and variables → Actions):

- `DOKPLOY_SERVER_URL`: URL do painel do Dokploy
- `DOKPLOY_API_KEY`: chave de API do Dokploy
- `DOKPLOY_APPLICATION_IDS`: ID da aplicação no Dokploy
