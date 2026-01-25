# Gestao de Tarefas

Plataforma completa de produtividade com tarefas, rotinas e agenda unificada. Pensado para equipes pequenas e uso pessoal, com foco em clareza visual e fluxo rapido.

## Destaques
- Agenda unica com tarefas + rotinas filtradas por dia
- Prioridades (alta/media/baixa) e etiquetas com filtros rapidos
- Resumo "Hoje" com contadores e progresso diario
- Lembretes in-app e atalhos para Email/WhatsApp
- Controle de acesso (admin x assistente)

## Stack
- Frontend: React + MUI + Dayjs
- Backend: FastAPI + SQLAlchemy
- Banco: Postgres

## Funcionalidades
- CRUD de tarefas e rotinas
- Dashboard com filtros, calendario e resumo
- Atribuicao de tarefas por usuario (admin)
- Login com JWT

## Demo
Em breve. (Posso adicionar o link do deploy quando estiver online.)

## Screenshots
Sugestao: adicione imagens aqui quando quiser destacar o visual.

| Dashboard | Rotinas | Usuarios |
| --- | --- | --- |
| (img) | (img) | (img) |

## Como rodar localmente

### 1) Backend
Requisitos: Python 3.11+, Postgres

Crie um `.env` em `backend/.env`:
```
DATABASE_URL=postgresql://USER:SENHA@localhost:5432/gestao_tarefas
SECRET_KEY=seu_segredo
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ADMIN_EMAIL=seu@email.com
ADMIN_PASSWORD=sua_senha
ADMIN_NAME=Seu Nome
ADMIN_ROLE=admin
CORS_ORIGINS=http://localhost:3000
```

Suba o backend:
```
cd backend
venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2) Frontend
```
cd backend/task-manager-frontend
npm install
npm start
```

## Variaveis de ambiente (frontend)
Defina no Vercel (ou localmente):
```
REACT_APP_API_URL=https://seu-backend.onrender.com
```

## Deploy gratuito (recomendado)
- Backend: Render Web Service (free)
- Banco: Supabase ou Neon (free)
- Frontend: Vercel (free)

Posso deixar um passo a passo completo no repo se quiser.

## Roadmap
- Notificacoes reais (email/whatsapp com provider)
- Drag and drop na agenda
- Exportacao CSV/ICS

## Licenca
MIT (sugestao)
