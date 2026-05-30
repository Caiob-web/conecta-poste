# Conecta Poste — Portal de Download

Site simples para Vercel com login usando a tabela `public.users` do Neon.

## Tabela esperada

```sql
public.users (
  id bigserial primary key,
  username text not null,
  password text not null,
  is_active boolean not null default true,
  created_at timestamp
)
```

O portal valida `username`, `password` e permite login apenas quando `is_active = true`.

## Variáveis de ambiente no Vercel

Configure em **Project Settings > Environment Variables**:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@HOST/neondb?sslmode=require
SESSION_SECRET=uma-chave-grande-aleatoria-com-32-caracteres-ou-mais
DOWNLOAD_URL=https://github.com/Caiob-web/conecta-poste/releases/latest/download/ConectaPoste-Setup.exe
```

Nunca coloque a `DATABASE_URL` no HTML, JavaScript público ou GitHub.

## Deploy no Vercel

1. Importe o repositório `Caiob-web/conecta-poste` no Vercel.
2. Defina o **Root Directory** como `conecta-poste-download-portal`.
3. Configure as variáveis de ambiente acima.
4. Faça o deploy.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Atualizar o instalador

Publique uma nova GitHub Release com o arquivo `ConectaPoste-Setup.exe` e marque como `latest`. O portal usa o link fixo:

```text
https://github.com/Caiob-web/conecta-poste/releases/latest/download/ConectaPoste-Setup.exe
```

Assim os usuários sempre baixam a versão mais recente.
