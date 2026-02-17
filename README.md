# Gestao de Tarefas

Plataforma full stack para tarefas, rotinas, entregas, retiradas e controle de equipamentos.

## Stack
- Frontend: React + MUI + Dayjs
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
2. Ajuste `REACT_APP_API_URL` para sua API local/remota.
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

Variaveis obrigatorias no Render:
- `DATABASE_URL`
- `SECRET_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CORS_ORIGINS` (inclua sua URL do Vercel)

Opcional:
- `UPLOADS_DIR` (padrao no `render.yaml`: `/var/data/uploads`)

Importante:
- sem armazenamento persistente no backend, arquivos em `uploads/` podem ser perdidos em reinicio/deploy.
- para persistencia real no Render, o `render.yaml` ja inclui disco persistente montado em `/var/data`.

### Frontend (Vercel)
No projeto `backend/task-manager-frontend`:
- `vercel.json` ja configurado para SPA rewrite
- Defina `REACT_APP_API_URL` com a URL publica do backend

Build/Output na Vercel:
- Build command: `npm run build`
- Output directory: `build`

## Checklist de publicacao
- `npm run build` no frontend sem erros
- API responde `GET /health` com `{"status":"ok"}`
- Login funcionando em producao
- CORS com dominio do frontend publicado
- Upload/download de PDFs validado em producao

## Licenca
MIT

