const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET /api/checkout?courseId=xxx → info do curso
  // GET /api/checkout?courseId=xxx&pixOnly=true&payerEmail=x → cria preferência PIX
  if (req.method === 'GET') {
    const courseId   = req.query?.courseId
    const pixOnly    = req.query?.pixOnly === 'true'
    const payerEmail = req.query?.payerEmail || ''
    const payerName  = req.query?.payerName  || ''
    const payerCpf   = (req.query?.payerCpf  || '').replace(/\D/g, '')
    if (!courseId) return res.status(400).json({ erro: 'courseId obrigatório' })
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const { data: course, error } = await supabase.from('courses').select('name, data').eq('id', courseId).single()
      if (error || !course) return res.status(404).json({ erro: 'Curso não encontrado.' })

      // Modo simples: só retorna info do curso
      if (!pixOnly) return res.status(200).json({ name: course.name, price: course.data?.price ?? null })

      // Modo PIX: cria preferência só com PIX
      const price   = course.data?.price
      if (!price)   return res.status(400).json({ erro: 'Preço não configurado.' })
      const siteUrl = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'
      const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()

      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ title: course.name, quantity: 1, unit_price: Number(price), currency_id: 'BRL' }],
          payer: {
            email: payerEmail || undefined,
            first_name: payerName.split(' ')[0] || undefined,
            last_name:  payerName.split(' ').slice(1).join(' ') || undefined,
            identification: payerCpf ? { type: 'CPF', number: payerCpf } : undefined,
            address: { zip_code: '00000000', street_name: 'N/A', street_number: 0 }
          },
          payment_methods: {
            default_payment_method_id: 'pix'
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
        })
      })
      const mpData = await mpRes.json()
      if (!mpRes.ok) return res.status(500).json({ erro: mpData.message || 'Erro MP' })
      return res.status(200).json({ initPoint: mpData.init_point, prefId: mpData.id })
    } catch (e) {
      return res.status(500).json({ erro: e.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { courseId, payerName, payerEmail } = req.body || {}
    if (!courseId || !payerEmail) {
      return res.status(400).json({ erro: 'courseId e payerEmail são obrigatórios.' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data: course, error } = await supabase
      .from('courses')
      .select('name, data')
      .eq('id', courseId)
      .single()

    if (error || !course) {
      return res.status(404).json({ erro: 'Curso não encontrado.' })
    }

    const price = course.data?.price
    if (!price || price <= 0) {
      return res.status(400).json({ erro: 'Preço não configurado. Entre em contato com a administradora.', courseData: course.data })
    }

    const siteUrl = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'
    const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()
    if (!mpToken) {
      return res.status(500).json({ erro: 'Configuração de pagamento ausente.' })
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json'
      },
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

    const mpData = await mpRes.json()
    if (!mpRes.ok) {
      return res.status(500).json({ erro: mpData.message || 'Erro ao criar preferência no Mercado Pago.' })
    }

    return res.status(200).json({ initPoint: mpData.init_point, prefId: mpData.id })

  } catch (err) {
    console.error('Erro checkout:', err)
    return res.status(500).json({ erro: 'Erro interno: ' + (err?.message || String(err)) })
  }
}
