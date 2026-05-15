const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Verificar que é a admin
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ erro: 'Apenas a administradora pode fazer uploads.' })
  }

  const { bucket, path } = req.body || {}
  if (!bucket || !path) return res.status(400).json({ erro: 'bucket e path são obrigatórios.' })

  // Gera URL assinada para upload direto do navegador
  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path)

  if (signError) return res.status(500).json({ erro: signError.message })

  return res.status(200).json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path
  })
}
