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
    const { email, name, phone, courseNames } = req.body || {}
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

    // Usa o nome do curso selecionado pelo admin; cai no env var como fallback
    const nomeCurso = (courseNames && courseNames.length > 0)
      ? courseNames.join(' e ')
      : (process.env.COURSE_NAME || 'o curso')
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
          subject: `Bem-vinda ao ${nomeCurso}! Seu acesso esta liberado 🎉`,
          html: `
<div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:540px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:#1C1917;padding:36px;text-align:center">
    <div style="font-size:2rem;margin-bottom:10px">🎓</div>
    <h1 style="color:#fff;font-size:1.3rem;margin:0 0 6px;font-weight:800;letter-spacing:-.02em">${nomeCurso}</h1>
    <p style="color:rgba(255,255,255,.6);font-size:.85rem;margin:0">Acesso liberado com sucesso</p>
  </div>

  <!-- Body -->
  <div style="padding:36px">
    <p style="font-size:1.05rem;font-weight:700;color:#1C1917;margin:0 0 8px">Ola, ${nomAluna}! 👋</p>
    <p style="font-size:.92rem;line-height:1.75;color:#57534E;margin:0 0 24px">
      Que alegria ter voce aqui! Seu acesso ao <strong style="color:#1C1917">${nomeCurso}</strong> foi liberado e voce ja pode comecar a estudar agora mesmo. 🚀
    </p>

    <!-- Dados de acesso -->
    <div style="background:#FAFAF9;border:1.5px solid #E7E5E4;border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#78716C;margin:0 0 14px">Seus dados de acesso</p>
      <div style="margin-bottom:12px">
        <div style="font-size:.75rem;color:#A8A29E;margin-bottom:3px">E-mail</div>
        <div style="font-size:.9rem;color:#1C1917;font-weight:600">${email}</div>
      </div>
      <div>
        <div style="font-size:.75rem;color:#A8A29E;margin-bottom:3px">Senha de acesso</div>
        <div style="font-size:.9rem;color:#1C1917;font-weight:600;letter-spacing:.05em">${password}</div>
      </div>
    </div>

    <p style="font-size:.82rem;color:#78716C;margin:0 0 24px">
      💡 <strong>Dica:</strong> voce pode criar uma senha personalizada logo apos o primeiro acesso.
    </p>

    <!-- CTA -->
    <div style="text-align:center">
      <a href="${siteUrl}/login.html"
         style="display:inline-block;background:#1C1917;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:.95rem;font-weight:700;letter-spacing:.01em">
        Acessar o curso agora →
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#F5F5F4;padding:20px 36px;text-align:center;border-top:1px solid #E7E5E4">
    <p style="font-size:.78rem;color:#A8A29E;margin:0">Qualquer duvida, entre em contato. Estamos aqui para ajudar! 💛</p>
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

        const msg = `Ola, ${nomAluna}! 🎉\n\nSeu acesso ao *${nomeCurso}* foi liberado!\n\nEstamos muito felizes em ter voce com a gente. Prepare-se para uma experiencia incrivel! 🚀\n\n*Seus dados de acesso:*\n📧 E-mail: ${email.trim().toLowerCase()}\n🔒 Senha: ${password}\n\n👇 Acesse agora:\n${siteUrl}/login.html\n\nQualquer duvida, estamos aqui! 💛`
        const waBody = `token=${encodeURIComponent(process.env.ULTRAMSG_TOKEN)}&to=${encodeURIComponent(numFinal)}&body=${encodeURIComponent(msg)}`

        // Limpa espaços/quebras de linha das env vars (causa "unescaped characters")
        const https = require('https')
        const instance = (process.env.ULTRAMSG_INSTANCE || '').trim()
        const waToken  = (process.env.ULTRAMSG_TOKEN  || '').trim()

        const waBodyClean = `token=${encodeURIComponent(waToken)}&to=${encodeURIComponent(numFinal)}&body=${encodeURIComponent(msg)}`

        const responseBody = await new Promise((resolve, reject) => {
          const reqUrl = new URL(`https://api.ultramsg.com/${instance}/messages/chat`)
          const req = https.request({
            hostname: reqUrl.hostname,
            path: reqUrl.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(waBodyClean)
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
          req.write(waBodyClean)
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
