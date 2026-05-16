const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Passo 1: body
  const { courseId, payerName, payerEmail } = req.body || {}
  if (!courseId || !payerEmail) return res.status(400).json({ passo: 1, erro: 'courseId e payerEmail obrigatórios' })

  // Passo 2: env vars
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!supabaseUrl) return res.status(500).json({ passo: 2, erro: 'SUPABASE_URL ausente' })
  if (!supabaseKey) return res.status(500).json({ passo: 2, erro: 'SUPABASE_SERVICE_KEY ausente' })
  if (!mpToken) return res.status(500).json({ passo: 2, erro: 'MP_ACCESS_TOKEN ausente' })

  // Passo 3: criar cliente supabase
  let supabase
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (e) {
    return res.status(500).json({ passo: 3, erro: 'createClient falhou: ' + e.message })
  }

  // Passo 4: query curso
  let course = null
  try {
    const { data, error } = await supabase.from('courses').select('name, data').eq('id', courseId).single()
    if (error) return res.status(404).json({ passo: 4, erro: error.message, code: error.code })
    course = data
  } catch (e) {
    return res.status(500).json({ passo: 4, erro: 'query falhou: ' + e.message })
  }

  if (!course) return res.status(404).json({ passo: 4, erro: 'curso null' })

  // Passo 5: preço
  const price = course.data?.price
  if (!price || price <= 0) return res.status(400).json({ passo: 5, erro: 'Preço não configurado' })

  // Passo 6: MP
  const siteUrl = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'
  let mpData
  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      })
    })
    mpData = await mpRes.json()
    if (!mpRes.ok) return res.status(500).json({ passo: 6, erro: mpData.message || 'Erro MP', detalhe: mpData })
  } catch (e) {
    return res.status(500).json({ passo: 6, erro: 'fetch MP falhou: ' + e.message })
  }

  return res.status(200).json({ initPoint: mpData.init_point })
}
