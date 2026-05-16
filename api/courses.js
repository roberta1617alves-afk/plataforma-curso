const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  if (user.email !== process.env.ADMIN_EMAIL) return null
  return user
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const admin = await verifyAdmin(req)
  if (!admin) return res.status(403).json({ erro: 'Acesso restrito à administradora.' })

  const action = (req.url || '').includes('action=')
    ? new URLSearchParams(req.url.split('?')[1] || '').get('action')
    : null

  // ── LISTAR CURSOS ──
  if (req.method === 'GET' && !action) {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, created_at')
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(200).json({ courses: data })
  }

  // ── CRIAR CURSO ──
  if (req.method === 'POST' && !action) {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ erro: 'Nome é obrigatório.' })
    const { data, error } = await supabase
      .from('courses')
      .insert({ name: name.trim() })
      .select()
      .single()
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(201).json({ course: data })
  }

  // ── ATUALIZAR CONTEÚDO DO CURSO ──
  if (req.method === 'PUT' && !action) {
    const { id, data: courseData, name } = req.body || {}
    if (!id) return res.status(400).json({ erro: 'ID é obrigatório.' })
    const updates = { updated_at: new Date().toISOString() }
    if (courseData !== undefined) updates.data = courseData
    if (name !== undefined) updates.name = name
    const { error } = await supabase.from('courses').update(updates).eq('id', id)
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── EXCLUIR CURSO ──
  if (req.method === 'DELETE' && !action) {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ erro: 'ID é obrigatório.' })
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── GERENCIAR ACESSO ──
  if (action === 'access') {
    // Conceder acesso
    if (req.method === 'POST') {
      const { userId, courseId } = req.body || {}
      if (!userId || !courseId) return res.status(400).json({ erro: 'userId e courseId são obrigatórios.' })
      const { error } = await supabase
        .from('course_access')
        .upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id' })
      if (error) return res.status(500).json({ erro: error.message })
      return res.status(200).json({ ok: true })
    }
    // Revogar acesso
    if (req.method === 'DELETE') {
      const { userId, courseId } = req.body || {}
      if (!userId || !courseId) return res.status(400).json({ erro: 'userId e courseId são obrigatórios.' })
      const { error } = await supabase
        .from('course_access')
        .delete()
        .eq('user_id', userId)
        .eq('course_id', courseId)
      if (error) return res.status(500).json({ erro: error.message })
      return res.status(200).json({ ok: true })
    }
    // Listar todos os acessos
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('course_access')
        .select('user_id, course_id, granted_at')
      if (error) return res.status(500).json({ erro: error.message })
      return res.status(200).json({ access: data })
    }
  }

  return res.status(405).json({ erro: 'Método não permitido.' })
}
