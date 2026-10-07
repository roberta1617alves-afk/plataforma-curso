const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = req.body || {}
    const { courseId, payerEmail, payerName } = body
    if (!courseId || !payerEmail) return res.status(400).json({ erro: 'Dados incompletos.' })

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data: course, error } = await supabase.from('courses').select('name, data').eq('id', courseId).single()
    if (error || !course) return res.status(404).json({ erro: 'Curso não encontrado.' })

    const price = course.data?.price
    if (!price || price <= 0) return res.status(400).json({ erro: 'Preço não configurado.' })

    const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()
    const siteUrl = process.env.SITE_URL || 'https://plataforma.robertaalves.com.br'

    const preference = {
      items: [{
        id: courseId,
        title: course.name,
        quantity: 1,
        unit_price: Number(price),
        currency_id: 'BRL'
      }],
      payer: {
        name: payerName || '',
        email: payerEmail
      },
      payment_methods: {
        excluded_payment_types: [
          { id: 'credit_card' },
          { id: 'debit_card' },
          { id: 'ticket' }
        ],
        installments: 1
      },
      back_urls: {
        success: `${siteUrl}/sucesso.html?courseId=${courseId}&email=${encodeURIComponent(payerEmail)}`,
        failure: `${siteUrl}/checkout.html?courseId=${courseId}`,
        pending: `${siteUrl}/aguardando.html?courseId=${courseId}&email=${encodeURIComponent(payerEmail)}`
      },
      auto_return: 'approved',
      external_reference: `${courseId}|${payerEmail}`,
      notification_url: `${siteUrl}/api/mp-webhook`,
      statement_descriptor: 'PLATAFORMA CURSOS'
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    })

    const pref = await mpRes.json()
    console.log('MP preference status:', mpRes.status, pref.id)

    if (!pref.id) {
      console.error('MP preference error:', JSON.stringify(pref))
      return res.status(200).json({ erro: 'Erro ao criar preferência PIX. Tente novamente.' })
    }

    return res.status(200).json({
      checkoutUrl: pref.init_point
    })

  } catch (err) {
    console.error('Erro create-pix-preference:', err)
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' })
  }
}
