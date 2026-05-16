const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { courseId, payerName, payerEmail } = req.body || {}
  if (!courseId || !payerEmail) return res.status(400).json({ erro: 'courseId e payerEmail são obrigatórios.' })

  // Buscar curso e preço no Supabase
  const { data: course, error } = await supabase
    .from('courses')
    .select('name, data')
    .eq('id', courseId)
    .single()

  if (error || !course) return res.status(404).json({ erro: 'Curso não encontrado.' })

  const price = course.data?.price
  if (!price || price <= 0) return res.status(400).json({ erro: 'Preço não configurado para este curso.' })

  const siteUrl = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'

  // Criar preferência no Mercado Pago
  const body = {
    items: [{
      title: course.name,
      quantity: 1,
      unit_price: Number(price),
      currency_id: 'BRL'
    }],
    payer: {
      name: payerName || '',
      email: payerEmail
    },
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

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const mpData = await mpRes.json()
  if (!mpRes.ok) return res.status(500).json({ erro: mpData.message || 'Erro ao criar preferência.' })

  return res.status(200).json({ initPoint: mpData.init_point })
}
