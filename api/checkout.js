const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // STEP 1: parse body
    const body = req.body || {}
    const { courseId, payerName, payerEmail } = body
    if (!courseId || !payerEmail) return res.status(400).json({ erro: 'courseId e payerEmail são obrigatórios.' })

    // STEP 2: check env vars
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY
    const mpToken = process.env.MP_ACCESS_TOKEN
    const siteUrl = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'

    if (!supabaseUrl) return res.status(500).json({ erro: 'SUPABASE_URL não configurado' })
    if (!supabaseKey) return res.status(500).json({ erro: 'SUPABASE_SERVICE_KEY não configurado' })
    if (!mpToken) return res.status(500).json({ erro: 'MP_ACCESS_TOKEN não configurado' })

    // STEP 3: create supabase client and query
    const supabase = createClient(supabaseUrl, supabaseKey)

    let course = null
    try {
      const result = await supabase.from('courses').select('name, data').eq('id', courseId).single()
      if (result.error) return res.status(404).json({ erro: 'Curso não encontrado: ' + result.error.message })
      course = result.data
    } catch (dbEx) {
      return res.status(500).json({ erro: 'Erro no banco: ' + dbEx.message })
    }

    if (!course) return res.status(404).json({ erro: 'Curso não encontrado.' })

    const price = course.data?.price
    if (!price || price <= 0) return res.status(400).json({ erro: 'Preço não configurado para este curso. Entre em contato com a administradora.' })

    // STEP 4: create MP preference
    const mpBody = {
      items: [{ title: course.name, quantity: 1, unit_price: Number(price), currency_id: 'BRL' }],
      payer: { name: payerName || '', email: payerEmail },
      back_urls: {
        success: `${siteUrl}/sucesso.html`,
        failure: `${siteUrl}/checkout.html?course=${courseId}`,
        pending: `${siteUrl}/sucesso.html`
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/api/mp-webhook`,
      external_reference: courseId,
      statement_descriptor: 'PLATAFORMA CURSOS'
    }

    let mpData
    try {
      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mpBody)
      })
      mpData = await mpRes.json()
      if (!mpRes.ok) return res.status(500).json({ erro: 'Erro MP: ' + (mpData.message || JSON.stringify(mpData)) })
    } catch (mpEx) {
      return res.status(500).json({ erro: 'Erro ao chamar MP: ' + mpEx.message })
    }

    return res.status(200).json({ initPoint: mpData.init_point })

  } catch (err) {
    return res.status(500).json({ erro: 'Erro geral: ' + (err?.message || String(err)) })
  }
}
