# Frontend — Gestão de Tarefas

Aplicação React construída com Vite e Material UI.

## Requisitos

- Node.js `^20.19.0` ou `>=22.12.0`
- Backend FastAPI em execução

## Desenvolvimento

Copie `.env.example` para `.env` e configure:

```env
VITE_API_URL=http://localhost:8000
```

Instale e execute:

```bash
npm install
npm start
```

A aplicação local usa `http://localhost:3000`.

## Verificações

```bash
npm test
npm run build
npm audit --omit=dev
```

O build de produção é gerado em `dist/`.

## Deploy no Vercel

O `vercel.json` configura o build, o diretório `dist` e o rewrite necessário para as rotas SPA. Defina `VITE_API_URL` nas variáveis do projeto antes da publicação.
