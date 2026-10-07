const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { secret, email, password } = req.body || {}

  // Token secreto de uso único para esta operação
  if (secret !== 'RobertaReset2026') {
    return res.status(403).json({ erro: 'Não autorizado.' })
  }

  // Busca o usuário pelo e-mail
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) return res.status(500).json({ erro: listErr.message })

  const user = (listData?.users || []).find(u => u.email === email)
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' })

  // Redefine a senha
  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password })
  if (updateErr) return res.status(500).json({ erro: updateErr.message })

  return res.status(200).json({ ok: true, msg: 'Senha redefinida com sucesso.' })
}
