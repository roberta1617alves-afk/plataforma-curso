const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Mercado Pago envia GET para validar a URL
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body || {}

  // Só processa notificações de pagamento
  if (type !== 'payment' || !data?.id) return res.status(200).json({ ok: true })

  // Buscar detalhes do pagamento no MP
  const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
    headers: { Authorization: `Bearer ${mpToken}` }
  })
  const payment = await mpRes.json()

  if (payment.status !== 'approved') return res.status(200).json({ ok: true })

  const payerEmail = payment.payer?.email
  const courseId   = payment.external_reference
  const payerName  = payment.payer?.first_name || ''

  if (!payerEmail || !courseId) return res.status(200).json({ ok: true })

  // Gera senha aleatória segura para cada aluna nova
  function gerarSenha() {
    const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const lower  = 'abcdefghjkmnpqrstuvwxyz'
    const digits = '23456789'
    const special = '@#$!'
    const all = upper + lower + digits + special
    let senha = ''
    // Garante pelo menos 1 de cada tipo
    senha += upper [Math.floor(Math.random() * upper.length)]
    senha += lower [Math.floor(Math.random() * lower.length)]
    senha += digits[Math.floor(Math.random() * digits.length)]
    senha += special[Math.floor(Math.random() * special.length)]
    // Completa até 10 caracteres
    for (let i = 4; i < 10; i++) senha += all[Math.floor(Math.random() * all.length)]
    // Embaralha
    return senha.split('').sort(() => Math.random() - 0.5).join('')
  }

  let userId
  let senhaGerada = null

  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = existing?.users?.find(u => u.email === payerEmail)

  if (existingUser) {
    userId = existingUser.id
  } else {
    senhaGerada = gerarSenha()
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: payerEmail,
      password: senhaGerada,
      email_confirm: true,
      user_metadata: { name: payerName }
    })
    if (createErr) return res.status(500).json({ erro: createErr.message })
    userId = created.user.id
  }

  // Conceder acesso ao curso
  const { error: accessErr } = await supabase.from('course_access').upsert(
    { user_id: userId, course_id: courseId },
    { onConflict: 'user_id,course_id' }
  )
  if (accessErr) {
    console.error('Erro ao conceder acesso:', accessErr)
    // Tenta insert simples caso upsert falhe
    const { error: insertErr } = await supabase.from('course_access').insert(
      { user_id: userId, course_id: courseId }
    )
    if (insertErr) console.error('Erro no insert de acesso:', insertErr)
  }

  // Buscar nome do curso
  const { data: course } = await supabase.from('courses').select('name').eq('id', courseId).single()
  const nomeCurso = course?.name || 'o curso'

  // Enviar e-mail de boas-vindas
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const siteUrl = process.env.SITE_URL || ''
      const nomAluna = payerName || 'Aluna'
      const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev'

      await resend.emails.send({
        from: fromEmail,
        to: payerEmail,
        subject: `🎉 Seu acesso ao ${nomeCurso} está pronto!`,
        html: `
<div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:40px auto;background:#fff;border:1px solid #E7E5E4;border-radius:16px;overflow:hidden">
  <div style="background:#1C1917;padding:28px 36px;text-align:center">
    <h1 style="color:#fff;font-size:1.2rem;margin:0;font-weight:800">${nomeCurso}</h1>
  </div>
  <div style="padding:32px 36px">
    <p style="font-size:1rem;font-weight:600;margin-bottom:12px">Olá, ${nomAluna}! 👋</p>
    <p style="font-size:.9rem;line-height:1.7;color:#44403C">Seu pagamento foi confirmado e o acesso foi liberado. Entre com os dados abaixo:</p>
    <div style="background:#F5F5F4;border-radius:10px;padding:16px 20px;margin:16px 0">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#78716C;margin-bottom:6px">E-mail</div>
      <div style="font-size:.92rem;color:#1C1917;font-weight:500">${payerEmail}</div>
    </div>
    <div style="background:#F5F5F4;border-radius:10px;padding:16px 20px;margin:16px 0">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#78716C;margin-bottom:6px">Senha de acesso</div>
      <div style="font-size:.92rem;color:#1C1917;font-weight:500">${existingUser ? '(use sua senha atual)' : senhaGerada}</div>
    </div>
    <p style="font-size:.82rem;color:#78716C">Você pode trocar sua senha após o primeiro acesso.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${siteUrl}/login.html" style="display:inline-block;background:#1C1917;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:.9rem;font-weight:700">Acessar o curso →</a>
    </div>
  </div>
</div>`
      })
    } catch (e) { console.error('Erro ao enviar e-mail:', e) }
  }

  // Enviar WhatsApp via UltraMsg
  if (process.env.ULTRAMSG_INSTANCE && process.env.ULTRAMSG_TOKEN) {
    try {
      const siteUrl2 = process.env.SITE_URL || ''
      const payerPhone = payment.payer?.phone?.number || ''
      const phone = payerPhone.replace(/\D/g, '').replace(/^0+/, '')
      if (phone) {
        const senhaTexto = existingUser ? '(use sua senha atual)' : senhaGerada
        const msg = `Olá ${nomAluna}! 🎉\n\nSeu acesso ao *${nomeCurso}* está liberado!\n\n📧 *E-mail:* ${payerEmail}\n🔑 *Senha:* ${senhaTexto}\n\n👉 Acesse agora: ${siteUrl2}/login.html\n\nQualquer dúvida é só chamar! 😊`
        const numFinal = phone.startsWith('55') ? phone : `55${phone}`
        const waBody = `token=${encodeURIComponent(process.env.ULTRAMSG_TOKEN)}&to=${encodeURIComponent(numFinal)}&body=${encodeURIComponent(msg)}`
        const waRes = await fetch(`https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE}/messages/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: waBody
        })
        const waData = await waRes.json().catch(() => ({}))
        console.log('MP webhook: WhatsApp para', numFinal, JSON.stringify(waData))
      }
    } catch (e) { console.error('MP webhook: erro ao enviar WhatsApp', e) }
  }

  return res.status(200).json({ ok: true })
}
