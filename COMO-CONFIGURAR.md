# Como configurar a plataforma — passo a passo

Tempo estimado: **30–40 minutos** (tudo gratuito)

---

## O que você vai precisar criar

| Serviço | Para quê | Custo |
|---|---|---|
| **GitHub** | Guardar os arquivos online | Gratuito |
| **Vercel** | Hospedar a plataforma | Gratuito |
| **Supabase** | Gerenciar o login das alunas | Gratuito |
| **Resend** | Enviar o e-mail de acesso | Gratuito (3.000 e-mails/mês) |

---

## PASSO 1 — Criar conta no GitHub e subir os arquivos

1. Acesse [github.com](https://github.com) e crie uma conta gratuita
2. Clique em **New repository** (botão verde)
3. Dê o nome `plataforma-curso` e clique em **Create repository**
4. Clique em **uploading an existing file**
5. Arraste **todos os arquivos** da pasta `plataforma-curso` para lá (incluindo a pasta `api`)
6. Clique em **Commit changes**

---

## PASSO 2 — Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e clique em **Start your project**
2. Entre com sua conta do GitHub
3. Clique em **New project**, escolha um nome (ex: `meu-curso`) e uma senha forte
4. Aguarde o projeto ser criado (cerca de 1 minuto)

### Pegar as chaves do Supabase

5. No menu lateral, clique em **Settings** → **API**
6. Copie os dois valores abaixo e **guarde em um lugar seguro**:
   - **Project URL** → começa com `https://...supabase.co`
   - **anon / public** → chave longa que começa com `eyJ...`
   - **service_role** → outra chave `eyJ...` (mantenha esta em segredo!)

### Configurar o e-mail de redefinição de senha

7. Em **Settings** → **Authentication** → **URL Configuration**:
   - **Site URL**: coloque `https://seu-site.vercel.app` (você saberá o endereço após o Passo 4)
   - **Redirect URLs**: adicione `https://seu-site.vercel.app/index.html`

---

## PASSO 3 — Criar conta no Resend

1. Acesse [resend.com](https://resend.com) e crie uma conta gratuita
2. No menu lateral, clique em **API Keys** → **Create API Key**
3. Dê um nome (ex: `plataforma-curso`) e copie a chave gerada (`re_...`)

> **Dica:** Para os primeiros testes, você pode enviar e-mails usando `onboarding@resend.dev` como remetente sem precisar de um domínio próprio.

### (Opcional) Usar seu próprio domínio como remetente

4. Clique em **Domains** → **Add Domain** e siga as instruções para verificar seu domínio

---

## PASSO 4 — Fazer o deploy na Vercel

1. Acesse [vercel.com](https://vercel.com) e entre com sua conta do GitHub
2. Clique em **Add New Project**
3. Selecione o repositório `plataforma-curso` e clique em **Import**
4. **Antes de clicar em Deploy**, clique em **Environment Variables** e adicione cada linha abaixo:

| Nome da variável | Valor |
|---|---|
| `SUPABASE_URL` | A URL do seu projeto Supabase |
| `SUPABASE_SERVICE_KEY` | A chave `service_role` do Supabase |
| `RESEND_API_KEY` | Sua chave do Resend (`re_...`) |
| `COURSE_NAME` | Nome do seu curso (ex: `Método Clara`) |
| `SITE_URL` | Deixe em branco por agora, preencha depois |
| `FROM_EMAIL` | `onboarding@resend.dev` (ou seu domínio verificado) |
| `KIWIFY_WEBHOOK_TOKEN` | Invente uma senha secreta (ex: `minhaSenha123`) |

5. Clique em **Deploy** e aguarde (cerca de 1 minuto)
6. Copie a URL gerada (ex: `https://plataforma-curso-xyz.vercel.app`)
7. Volte nas variáveis de ambiente da Vercel, clique em `SITE_URL` e preencha com essa URL
8. Volte no Supabase e preencha a **Site URL** e **Redirect URLs** com essa mesma URL

---

## PASSO 5 — Preencher o config.js

1. Abra o arquivo `config.js` da pasta `plataforma-curso`
2. Substitua os valores:

```js
window.SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co'  // ← sua URL do Supabase
window.SUPABASE_ANON_KEY = 'eyJ...'                           // ← chave anon do Supabase
window.SITE_NAME         = 'Nome do Seu Curso'                // ← nome que aparece no topo
```

3. Salve e faça o upload novamente no GitHub (isso vai atualizar a Vercel automaticamente)

---

## PASSO 6 — Configurar o Webhook na Kiwify

1. Acesse o painel da Kiwify e vá até o seu produto
2. Procure a opção **Webhook** ou **Integrações**
3. Adicione um novo webhook com:
   - **URL**: `https://seu-site.vercel.app/api/webhook`
   - **Token / Secret**: o mesmo valor que você colocou em `KIWIFY_WEBHOOK_TOKEN`
   - **Evento**: `order_approved`
4. Salve

---

## PASSO 7 — Testar tudo

1. Acesse `https://seu-site.vercel.app/login.html`
2. Para criar a primeira conta de administradora manualmente:
   - Vá ao Supabase → **Authentication** → **Users** → **Add user**
   - Preencha seu e-mail e uma senha
3. Faça login e clique em **Editar** para começar a adicionar aulas

Para testar o webhook, você pode simular uma compra na Kiwify ou usar uma ferramenta como [Postman](https://postman.com) para enviar uma requisição POST para `/api/webhook`.

---

## Dúvidas frequentes

**A aluna não recebeu o e-mail.** Verifique se a `RESEND_API_KEY` está correta na Vercel e se o domínio remetente está verificado no Resend.

**A plataforma pede login mas não consigo entrar.** Confirme que o `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `config.js` estão corretos.

**O webhook não está funcionando.** Verifique nos logs da Vercel (aba **Functions**) se há alguma mensagem de erro.
