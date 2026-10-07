const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Diagnóstico temporário de pagamento
  const { paymentId } = req.query || {}
  if (req.method === 'GET' && paymentId) {
    const mpToken = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g, '').trim()
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    })
    const d = await r.json()
    return res.status(200).json({ status: d.status, detail: d.status_detail, cause: d.cause, method: d.payment_method_id, type: d.payment_type_id })
  }

  // Verificação de acesso pós-pagamento (sem auth)
  const { courseId, email } = req.query || {}
  if (req.method === 'GET' && courseId && email) {
    try {
      const { data: users } = await supabase.auth.admin.listUsers()
      const user = users?.users?.find(u => u.email === email)
      if (!user) return res.status(200).json({ hasAccess: false })
      const { data: access } = await supabase
        .from('user_courses').select('id')
        .eq('user_id', user.id).eq('course_id', courseId).single()
      return res.status(200).json({ hasAccess: !!access })
    } catch {
      return res.status(200).json({ hasAccess: false })
    }
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ isAdmin: false })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ isAdmin: false })

  return res.status(200).json({
    isAdmin: user.email === process.env.ADMIN_EMAIL,
    email: user.email
  })
}
