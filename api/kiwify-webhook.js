const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function gerarSenha() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '@#$!'
  const all = upper + lower + digits + special
  let senha = ''
  senha += upper  [Math.floor(Math.random() * upper.length)]
  senha += lower  [Math.floor(Math.random() * lower.length)]
  senha += digits [Math.floor(Math.random() * digits.length)]
  senha += special[Math.floor(Math.random() * special.length)]
  for (let i = 4; i < 10; i++) senha += all[Math.floor(Math.random() * all.length)]
  return senha.split('').sort(() => Math.random() - 0.5).join('')
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method === 'GET')     return res.status(200).json({ ok: true })
  if (req.method !== 'POST')   return res.status(405).end()

  // Valida token de segurança
  const token = req.query?.token || ''
  const validToken = (process.env.KIWIFY_TOKEN || '').trim()
  if (validToken && token !== validToken) {
    console.error('Kiwify webhook: token inválido')
    return res.status(401).json({ erro: 'Token inválido' })
  }

  try {
    const body = req.body || {}
    console.log('Kiwify webhook recebido:', JSON.stringify(body))

    // Só processa vendas pagas
    const status = body.order_status || body.status || ''
    if (status !== 'paid' && status !== 'approved') {
      return res.status(200).json({ ok: true, ignorado: status })
    }

    // Dados do comprador
    const customer    = body.customer || body.Customer || {}
    const payerEmail  = customer.email  || customer.Email  || ''
    const payerName   = customer.name   || customer.Name   || ''
    const payerPhone  = customer.mobile || customer.phone  || customer.Phone || ''

    // Dados do produto
    const product     = body.product || body.Product || {}
    const productName = product.name || product.Name || product.title || ''
    const productId   = product.id   || product.Id   || ''

    if (!payerEmail) {
      console.error('Kiwify webhook: email não encontrado', body)
      return res.status(200).json({ ok: true })
    }

    // Busca curso correspondente no Supabase pelo nome ou ID externo
    let courseId = null
    const { data: courses } = await supabase.from('courses').select('id, name, data')

    if (courses?.length) {
      // Tenta match por kiwify_product_id salvo no data do curso
      const byId = courses.find(c => c.data?.kiwify_product_id === productId)
      if (byId) {
        courseId = byId.id
      } else {
        // Tenta match por nome (busca parcial, case-insensitive)
        const prodNorm = productName.toLowerCase()
        const byName = courses.find(c =>
          prodNorm.includes(c.name.toLowerCase().substring(0, 10)) ||
          c.name.toLowerCase().includes(prodNorm.substring(0, 10))
        )
        if (byName) courseId = byName.id
      }
    }

    if (!courseId) {
      console.error('Kiwify webhook: curso não encontrado para produto', productName, productId)
      return res.status(200).json({ ok: true, erro: 'Curso não encontrado' })
    }

    // Criar ou buscar usuária no Supabase
    let userId
    let senhaGerada = null

    const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existing?.users?.find(u => u.email === payerEmail)

    if (existingUser) {
      userId = existingUser.id
    } else {
      senhaGerada = gerarSenha()
      const firstName = payerName.split(' ')[0] || 'Aluna'
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: payerEmail,
        password: senhaGerada,
        email_confirm: true,
        user_metadata: { name: payerName, phone: payerPhone }
      })
      if (createErr) {
        console.error('Kiwify webhook: erro ao criar usuária', createErr)
        return res.status(500).json({ erro: createErr.message })
      }
      userId = created.user.id
    }

    // Conceder acesso ao curso
    const { error: accessErr } = await supabase.from('course_access').upsert(
      { user_id: userId, course_id: courseId },
      { onConflict: 'user_id,course_id' }
    )
    if (accessErr) {
      console.error('Kiwify webhook: erro ao conceder acesso', accessErr)
      const { error: insertErr } = await supabase.from('course_access').insert(
        { user_id: userId, course_id: courseId }
      )
      if (insertErr) console.error('Kiwify webhook: erro no insert', insertErr)
    }

    // Buscar nome do curso
    const { data: course } = await supabase.from('courses').select('name').eq('id', courseId).single()
    const nomeCurso = course?.name || 'o curso'
    const nomAluna  = payerName.split(' ')[0] || 'Aluna'

    // Enviar e-mail de boas-vindas
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = require('resend')
        const resend  = new Resend(process.env.RESEND_API_KEY)
        const siteUrl = process.env.SITE_URL || ''
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
      } catch (e) { console.error('Kiwify webhook: erro ao enviar e-mail', e) }
    }

    // Enviar WhatsApp via UltraMsg
    if (process.env.ULTRAMSG_INSTANCE && process.env.ULTRAMSG_TOKEN) {
      try {
        const siteUrl2 = process.env.SITE_URL || ''
        const phone = (payerPhone || '').replace(/\D/g, '').replace(/^0+/, '')
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
          console.log('Kiwify webhook: WhatsApp para', numFinal, JSON.stringify(waData))
        }
      } catch (e) { console.error('Kiwify webhook: erro ao enviar WhatsApp', e) }
    }

    console.log('Kiwify webhook: acesso concedido para', payerEmail, 'no curso', courseId)
    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('Kiwify webhook erro geral:', err)
    return res.status(500).json({ erro: err.message })
  }
}
