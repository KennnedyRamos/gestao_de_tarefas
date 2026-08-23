# Gestao de Tarefas

Plataforma Full Stack para gestão operacional, desenvolvida para centralizar tarefas, rotinas, entregas, retiradas e controle de equipamentos. O projeto integra frontend React, API REST em FastAPI e banco PostgreSQL, além de autenticação, controle de permissões, upload de documentos, OCR e infraestrutura de deploy.

## Stack
- Frontend: React + Vite + MUI + Dayjs
- Backend: FastAPI + SQLAlchemy
- Banco: PostgreSQL

## Funcionalidades principais
- Tarefas e rotinas com controle por usuario
- Entregas com anexos PDF
- Base 02.02.20 com filtros e historicos
- Gestao de equipamentos com OCR de etiqueta (RG + etiqueta)
- Permissoes por perfil (admin/assistente)

## Estrutura
- `backend/`: API FastAPI
- `backend/task-manager-frontend/`: app React

## Rodando local

### Backend
1. Copie `backend/.env.example` para `backend/.env` e ajuste os valores.
2. Instale dependencias e inicie:

```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
1. Copie `backend/task-manager-frontend/.env.example` para `backend/task-manager-frontend/.env`.
2. Ajuste `VITE_API_URL` para sua API local/remota.
3. Rode:

```bash
cd backend/task-manager-frontend
npm install
npm start
```

## Pronto para deploy web

### Backend (Render)
Este repositorio ja inclui `render.yaml` com:
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Healthcheck: `GET /health`
- Configuracao pronta para plano Free usando Supabase Storage nos PDFs

Variaveis obrigatorias no Render:
- `DATABASE_URL`
- `SECRET_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CORS_ORIGINS` (inclua sua URL do Vercel)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (ex.: `deliveries`, configurado como privado)

Opcional:
- `UPLOADS_DIR` (somente se quiser salvar localmente no servidor)
- `DB_BOOTSTRAP_MODE` (`sync` recomendado no deploy; `background` executa ajustes sem bloquear o startup; `off` desativa)
- `SUPABASE_STORAGE_PREFIX` (ex.: `deliveries`)
- `SUPABASE_STORAGE_LEGACY_PATHS` (`true` para tentar resolver caminhos antigos do banco no Supabase)

Importante:
- sem armazenamento persistente no backend, arquivos em `uploads/` podem ser perdidos em reinicio/deploy.
- alternativa no plano free: usar Supabase Storage para os PDFs de entregas.
- o bucket `deliveries` deve ser criado como privado no painel do Supabase.
- se usar plano pago com disco persistente no Render, configure `UPLOADS_DIR=/var/data/uploads`.

### Frontend (Vercel)
No projeto `backend/task-manager-frontend`:
- `vercel.json` ja configurado para SPA rewrite
- Defina `VITE_API_URL` com a URL publica do backend

Build/Output na Vercel:
- Build command: `npm run build`
- Output directory: `dist`

## Checklist de publicacao
- `npm run build` no frontend sem erros
- API responde `GET /health` e `GET /health/db` com `{"status":"ok"}`
- Login funcionando em producao
- CORS com dominio do frontend publicado
- Upload/download de PDFs validado em producao

## Licenca
MIT

