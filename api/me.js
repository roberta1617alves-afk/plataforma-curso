const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET' && req.query.mpcheck) {
    const t = (process.env.MP_ACCESS_TOKEN || '').replace(/﻿/g,'').trim()
    const [uRes, mRes] = await Promise.all([
      fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${t}` } }),
      fetch('https://api.mercadopago.com/v1/payment_methods', { headers: { Authorization: `Bearer ${t}` } })
    ])
    const u = await uRes.json()
    const methods = await mRes.json()
    const pid = req.query.pid
    if (pid) {
      const pr = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, { headers: { Authorization: `Bearer ${t}` } })
      const pd = await pr.json()
      return res.status(200).json({ status: pd.status, detail: pd.status_detail, cause: pd.cause, amount: pd.transaction_amount, preference_id: pd.order?.id, external_ref: pd.external_reference, payer_email: pd.payer?.email, payer_id: pd.payer?.id, additional_info: pd.additional_info })
    }
    return res.status(200).json({ tokenTipo: 'PRODUCAO ✓', email: u.email, id: u.id })
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
