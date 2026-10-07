module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const id = req.query.id
  if (!id) return res.status(400).json({ erro: 'id obrigatorio' })
  const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${mpToken}` }
  })
  const data = await r.json()
  return res.status(200).json({
    status: data.status,
    detail: data.status_detail,
    cause: data.cause,
    method: data.payment_method_id,
    type: data.payment_type_id,
    amount: data.transaction_amount
  })
}
