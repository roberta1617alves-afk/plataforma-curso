const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

// Clientes inicializados fora do handler para reutilizar entre chamadas
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // chave service_role (secreta, nunca exposta no front)
)
const resend = new Resend(process.env.RESEND_API_KEY)

function gerarSenha() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let senha = ''
  for (let i = 0; i < 12; i++) senha += chars[Math.floor(Math.random() * chars.length)]
  return senha
}

module.exports = async function handler(req, res) {
  // Apenas POST é aceito
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // Verificação do token secreto do webhook (configurado na Kiwify e no .env)
  const tokenRecebido = req.headers['x-kiwify-token'] || req.query.token
  if (process.env.KIWIFY_WEBHOOK_TOKEN && tokenRecebido !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    return res.status(401).json({ erro: 'Token inválido' })
  }

  const { event, data } = req.body || {}

  // Só age quando o pagamento é aprovado
  if (event !== 'order_approved') {
    return res.status(200).json({ ok: true, ignorado: event })
  }

  const email = data?.buyer?.email?.trim().toLowerCase()
  const nome  = data?.buyer?.name?.trim() || 'Aluna'

  if (!email) {
    return res.status(400).json({ erro: 'E-mail não encontrado no payload' })
  }

  // ── 1. Criar (ou recuperar) usuário no Supabase ──
  let senha = null
  let jaExistia = false

  const { data: usuarioCriado, error: erroCriacao } = await supabase.auth.admin.createUser({
    email,
    password: gerarSenha(),
    email_confirm: true,
    user_metadata: { name: nome }
  })

  if (erroCriacao) {
    if (erroCriacao.message?.includes('already been registered')) {
      jaExistia = true
    } else {
      console.error('Erro ao criar usuário:', erroCriacao)
      return res.status(500).json({ erro: erroCriacao.message })
    }
  } else {
    senha = usuarioCriado.user?.user_metadata?._senha_temp
  }

  // Se é novo usuário, gera a senha e a salva nos metadados para enviar por e-mail
  if (!jaExistia) {
    const novaSenha = gerarSenha()
    await supabase.auth.admin.updateUserById(usuarioCriado.user.id, {
      password: novaSenha,
      user_metadata: { name: nome }
    })
    senha = novaSenha
  }

  // ── 2. Gerar link de acesso direto (magic link) ──
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: process.env.SITE_URL + '/index.html'
    }
  })
  const magicLink = linkData?.properties?.action_link || process.env.SITE_URL + '/login.html'

  // ── 3. Enviar e-mail de boas-vindas via Resend ──
  const nomeCurso = process.env.COURSE_NAME || 'seu curso'
  const siteUrl   = process.env.SITE_URL    || ''

  const { error: erroEmail } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to: email,
    subject: `🎉 Seu acesso ao ${nomeCurso} está pronto!`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#FAFAF9; font-family:'Segoe UI',system-ui,sans-serif; color:#1C1917; }
  .wrap { max-width:520px; margin:40px auto; background:#fff; border:1px solid #E7E5E4; border-radius:16px; overflow:hidden; }
  .header { background:#1C1917; padding:32px 36px; text-align:center; }
  .header h1 { color:#fff; font-size:1.3rem; font-weight:800; margin:0; letter-spacing:-.02em; }
  .body { padding:36px; }
  .greeting { font-size:1rem; font-weight:600; margin-bottom:12px; }
  .text { font-size:.9rem; line-height:1.7; color:#44403C; margin-bottom:20px; }
  .box { background:#F5F5F4; border-radius:10px; padding:18px 20px; margin-bottom:24px; }
  .box-label { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#78716C; margin-bottom:8px; }
  .box-val { font-size:.92rem; color:#1C1917; font-weight:500; word-break:break-all; }
  .btn-wrap { text-align:center; margin:24px 0; }
  .btn { display:inline-block; background:#1C1917; color:#fff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:.92rem; font-weight:700; letter-spacing:.01em; }
  .footer { padding:20px 36px; border-top:1px solid #E7E5E4; font-size:.76rem; color:#A8A29E; text-align:center; line-height:1.5; }
</style></head>
<body>
<div class="wrap">
  <div class="header"><h1>${nomeCurso}</h1></div>
  <div class="body">
    <p class="greeting">Olá, ${nome}! 👋</p>
    <p class="text">Seu acesso ao <strong>${nomeCurso}</strong> foi liberado. Clique no botão abaixo para entrar na plataforma com um clique:</p>

    <div class="btn-wrap">
      <a class="btn" href="${magicLink}">Acessar o curso agora</a>
    </div>

    <p class="text">Ou, se preferir, acesse com seu e-mail e senha:</p>

    <div class="box">
      <div class="box-label">E-mail</div>
      <div class="box-val">${email}</div>
    </div>
    ${!jaExistia && senha ? `
    <div class="box">
      <div class="box-label">Senha temporária</div>
      <div class="box-val">${senha}</div>
    </div>
    <p class="text" style="font-size:.82rem;color:#78716C;">Você pode trocar sua senha a qualquer momento clicando em "Esqueci minha senha" na tela de login.</p>
    ` : `<p class="text" style="font-size:.82rem;color:#78716C;">Use a mesma senha da sua conta já existente.</p>`}

    <p class="text">Se tiver dúvidas, responda este e-mail. Bons estudos! 🚀</p>
  </div>
  <div class="footer">
    Você recebeu este e-mail porque realizou uma compra em nosso site.<br>
    ${siteUrl ? `<a href="${siteUrl}" style="color:#78716C;">${siteUrl}</a>` : ''}
  </div>
</div>
</body></html>`
  })

  if (erroEmail) {
    console.error('Erro ao enviar e-mail:', erroEmail)
    // Não retorna erro para a Kiwify — o usuário foi criado, só o e-mail falhou
  }

  return res.status(200).json({
    ok: true,
    usuarioCriado: !jaExistia,
    emailEnviado: !erroEmail
  })
}
