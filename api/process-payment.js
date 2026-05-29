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
    const siteUrl  = process.env.SITE_URL || 'https://plataforma-curso-swart.vercel.app'

    const firstName = (payerName || '').split(' ')[0] || 'Aluna'
    const lastName  = (payerName || '').split(' ').slice(1).join(' ') || firstName

    const deviceId = (body.deviceId || '').trim()

    // Monta payload base
    const payload = {
      transaction_amount: Number(price),
      description: course.name,
      external_reference: courseId,
      notification_url: `${siteUrl}/api/mp-webhook`,
      statement_descriptor: 'PLATAFORMA CURSOS',
      additional_info: {
        items: [{ id: courseId, title: course.name, quantity: 1, unit_price: Number(price) }],
        payer: { first_name: firstName, last_name: lastName }
      },
      payer: {
        email: payerEmail,
        first_name: firstName,
        last_name: lastName
      }
    }

    // Pagamento com cartão
    if (body.token) {
      payload.token               = body.token
      payload.payment_method_id   = body.paymentMethodId
      payload.installments        = Number(body.installments) || 1
      if (body.issuerId) payload.issuer_id = body.issuerId
      if (body.identificationType && body.identificationNumber) {
        payload.payer.identification = { type: body.identificationType, number: body.identificationNumber }
      }
    }
    // PIX
    else if (body.paymentMethodId === 'pix') {
      payload.payment_method_id = 'pix'
      payload.payment_type_id   = 'bank_transfer'
      if (body.identificationNumber) {
        payload.payer.identification = { type: 'CPF', number: body.identificationNumber }
      }
    }
    // Outro método
    else if (body.paymentMethodId) {
      payload.payment_method_id = body.paymentMethodId
      if (body.identificationType && body.identificationNumber) {
        payload.payer.identification = { type: body.identificationType, number: body.identificationNumber }
      }
    } else {
      return res.status(400).json({ erro: 'Método de pagamento não informado.' })
    }

    const mpHeaders = {
      Authorization: `Bearer ${mpToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${courseId}-${payerEmail}-${Date.now()}`
    }
    if (deviceId) mpHeaders['X-meli-session-id'] = deviceId

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: mpHeaders,
      body: JSON.stringify(payload)
    })

    const payment = await mpRes.json()
    console.log('MP payment status:', payment.status, payment.status_detail)

    if (payment.status === 'approved') {
      return res.status(200).json({ status: 'approved' })
    }

    if (payment.status === 'pending' || payment.status === 'in_process') {
      const pix = payment.point_of_interaction?.transaction_data
      return res.status(200).json({
        status: 'pending',
        paymentId: payment.id,
        pixQrCode:       pix?.qr_code        || null,
        pixQrCodeBase64: pix?.qr_code_base64 || null
      })
    }

    // Recusado — traduz a causa
    console.log('MP rejected:', JSON.stringify({ status: payment.status, detail: payment.status_detail, cause: payment.cause }))
    const erros = {
      cc_rejected_insufficient_amount: 'Saldo insuficiente no cartão.',
      cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
      cc_rejected_bad_filled_date: 'Data de vencimento incorreta.',
      cc_rejected_bad_filled_security_code: 'CVV incorreto.',
      cc_rejected_blacklist: 'Pagamento não autorizado pelo banco.',
      cc_rejected_call_for_authorize: 'Ligue para seu banco para autorizar.',
      cc_rejected_duplicated_payment: 'Pagamento duplicado detectado.',
    }
    const msg = erros[payment.status_detail] || 'Pagamento recusado. Verifique os dados e tente novamente.'
    return res.status(200).json({ status: payment.status || 'rejected', erro: msg })

  } catch (err) {
    console.error('Erro process-payment:', err)
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' })
  }
}
