const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  if (user.email !== process.env.ADMIN_EMAIL) return null
  return user
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const admin = await verifyAdmin(req)
  if (!admin) return res.status(403).json({ erro: 'Acesso restrito à administradora.' })

  // ── LISTAR ALUNAS ──
  if (req.method === 'GET') {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (error) return res.status(500).json({ erro: error.message })
    const students = data.users
      .filter(u => u.email !== process.env.ADMIN_EMAIL)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.name || '',
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return res.status(200).json({ students })
  }

  // ── CRIAR ALUNA ──
  if (req.method === 'POST') {
    const { email, name, phone } = req.body || {}
    if (!email) return res.status(400).json({ erro: 'E-mail é obrigatório.' })

    const password = process.env.DEFAULT_STUDENT_PASSWORD || 'Mentoras@2024'
    const phoneClean = (phone || '').replace(/\D/g, '')

    // Log de diagnóstico
    console.log('[students] Criando aluna:', email, '| phone raw:', phone, '| phoneClean:', phoneClean)
    console.log('[students] ENV check — ULTRAMSG_INSTANCE:', process.env.ULTRAMSG_INSTANCE ? 'SET' : 'VAZIO',
      '| ULTRAMSG_TOKEN:', process.env.ULTRAMSG_TOKEN ? 'SET' : 'VAZIO',
      '| RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'SET' : 'VAZIO')

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { name: (name || '').trim(), phone: phoneClean }
    })
    if (error) {
      const msg = error.message.includes('already been registered')
        ? 'Este e-mail já está cadastrado.'
        : error.message
      return res.status(400).json({ erro: msg })
    }

    const nomeCurso = process.env.COURSE_NAME || 'o curso'
    const siteUrl   = process.env.SITE_URL || ''
    const nomAluna  = (name || '').trim().split(' ')[0] || 'Aluna'

    let emailStatus = 'nao_configurado'
    let waStatus    = 'nao_configurado'

    // Enviar e-mail e WhatsApp em PARALELO
    const [emailResult, waResult] = await Promise.allSettled([

      // ── E-MAIL ──
      (async () => {
        if (!process.env.RESEND_API_KEY) {
          console.log('[students] Email pulado - RESEND_API_KEY vazio')
          return 'sem_chave'
        }
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const r = await resend.emails.send({
          from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
          to: email,
          subject: `Seu acesso ao ${nomeCurso} esta pronto!`,
          html: `
<div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:40px auto;background:#fff;border:1px solid #E7E5E4;border-radius:16px;overflow:hidden">
  <div style="background:#1C1917;padding:28px 36px;text-align:center">
    <h1 style="color:#fff;font-size:1.2rem;margin:0;font-weight:800">${nomeCurso}</h1>
  </div>
  <div style="padding:32px 36px">
    <p style="font-size:1rem;font-weight:600;margin-bottom:12px">Ola, ${nomAluna}!</p>
    <p style="font-size:.9rem;line-height:1.7;color:#44403C">Seu acesso foi liberado. Entre com os dados abaixo:</p>
    <div style="background:#F5F5F4;border-radius:10px;padding:16px 20px;margin:16px 0">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#78716C;margin-bottom:6px">E-mail</div>
      <div style="font-size:.92rem;color:#1C1917;font-weight:500">${email}</div>
    </div>
    <div style="background:#F5F5F4;border-radius:10px;padding:16px 20px;margin:16px 0">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#78716C;margin-bottom:6px">Senha de acesso</div>
      <div style="font-size:.92rem;color:#1C1917;font-weight:500">${password}</div>
    </div>
    <p style="font-size:.82rem;color:#78716C">Voce pode trocar sua senha apos o primeiro acesso.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${siteUrl}/login.html" style="display:inline-block;background:#1C1917;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:.9rem;font-weight:700">Acessar o curso</a>
    </div>
  </div>
</div>`
        })
        if (r.error) {
          console.log('[students] Erro ao enviar email:', JSON.stringify(r.error))
          throw new Error(r.error.message)
        }
        console.log('[students] Email enviado com sucesso para', email)
        return 'enviado'
      })(),

      // ── WHATSAPP ──
      (async () => {
        if (!process.env.ULTRAMSG_INSTANCE || !process.env.ULTRAMSG_TOKEN) {
          console.log('[students] WA pulado - ULTRAMSG_INSTANCE ou ULTRAMSG_TOKEN vazio')
          return 'sem_chave'
        }
        if (!phoneClean) {
          console.log('[students] WA pulado - numero de telefone vazio')
          return 'sem_telefone'
        }
        const numLimpo = phoneClean.replace(/^0+/, '')
        const numFinal = numLimpo.startsWith('55') ? numLimpo : `55${numLimpo}`
        console.log('[students] Enviando WA para:', numFinal)

        const msg = `Ola ${nomAluna}! Seu acesso ao ${nomeCurso} esta liberado!\n\nE-mail: ${email.trim().toLowerCase()}\nSenha: ${password}\n\nAcesse: ${siteUrl}/login.html`
        const waBody = `token=${encodeURIComponent(process.env.ULTRAMSG_TOKEN)}&to=${encodeURIComponent(numFinal)}&body=${encodeURIComponent(msg)}`

        // Usa https nativo do Node (evita problemas com fetch em funções serverless)
        const https = require('https')
        const responseBody = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'api.ultramsg.com',
            path: `/${process.env.ULTRAMSG_INSTANCE}/messages/chat`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(waBody)
            }
          }, (resp) => {
            let raw = ''
            resp.on('data', chunk => raw += chunk)
            resp.on('end', () => {
              console.log('[students] WA HTTP', resp.statusCode, '| resposta:', raw)
              resolve({ statusCode: resp.statusCode, raw })
            })
          })
          req.on('error', (e) => {
            console.log('[students] WA erro de rede:', e.message)
            reject(e)
          })
          req.write(waBody)
          req.end()
        })

        let waData = {}
        try { waData = JSON.parse(responseBody.raw) } catch {}

        if (responseBody.statusCode !== 200 || waData.error) {
          throw new Error(`WA falhou (HTTP ${responseBody.statusCode}): ${responseBody.raw}`)
        }
        return 'enviado'
      })()

    ])

    // Determinar status de cada canal
    emailStatus = emailResult.status === 'fulfilled'
      ? (emailResult.value || 'enviado')
      : `erro: ${emailResult.reason?.message || 'desconhecido'}`

    waStatus = waResult.status === 'fulfilled'
      ? (waResult.value || 'enviado')
      : `erro: ${waResult.reason?.message || 'desconhecido'}`

    console.log('[students] Resultado final — email:', emailStatus, '| wa:', waStatus)

    return res.status(201).json({
      ok: true,
      student: { id: data.user.id, email: data.user.email, name },
      emailStatus,
      waStatus
    })
  }

  // ── REMOVER ALUNA ──
  if (req.method === 'DELETE') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ erro: 'ID da aluna é obrigatório.' })
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return res.status(400).json({ erro: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ erro: 'Método não permitido.' })
}
