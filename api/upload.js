const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Tamanho máximo: 4 MB (limite seguro para Vercel serverless)
const MAX_BYTES = 4 * 1024 * 1024

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Verifica que é a admin
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user || user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ erro: 'Apenas a administradora pode fazer uploads.' })
  }

  const { bucket, path, base64, contentType } = req.body || {}
  if (!bucket || !path || !base64) {
    return res.status(400).json({ erro: 'bucket, path e base64 são obrigatórios.' })
  }

  let buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return res.status(400).json({ erro: 'base64 inválido.' })
  }

  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ erro: `Arquivo muito grande (máximo ${MAX_BYTES / 1024 / 1024} MB).` })
  }

  // Tenta criar o bucket automaticamente se não existir
  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {})

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true
    })

  if (error) {
    console.error('[upload] Erro Supabase:', error.message)
    return res.status(500).json({ erro: error.message })
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  console.log('[upload] Sucesso:', data.publicUrl)
  return res.status(200).json({ url: data.publicUrl })
}
