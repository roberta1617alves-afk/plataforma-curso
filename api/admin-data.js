const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Token inválido.' })

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const qs = new URLSearchParams((req.url || '').split('?')[1] || '')
  const action = qs.get('action')

  // ── PROGRESSO DAS ALUNAS (admin only) ──
  if (req.method === 'GET' && action === 'progress') {
    if (!isAdmin) return res.status(403).json({ erro: 'Acesso restrito.' })
    const courseId = qs.get('courseId')
    if (!courseId) return res.status(400).json({ erro: 'courseId obrigatório.' })

    const [progressRes, usersRes] = await Promise.all([
      supabase.from('user_progress').select('user_id, lesson_id, completed, updated_at').eq('course_id', courseId),
      supabase.auth.admin.listUsers({ perPage: 1000 })
    ])

    const progressData = progressRes.data || []
    const students = (usersRes.data?.users || [])
      .filter(u => u.email !== process.env.ADMIN_EMAIL)
      .map(u => ({ id: u.id, email: u.email, name: u.user_metadata?.name || '', last_sign_in: u.last_sign_in_at }))

    return res.status(200).json({ progress: progressData, students })
  }

  // ── BUSCAR DÚVIDAS ──
  if (req.method === 'GET' && action === 'doubts') {
    const courseId = qs.get('courseId')
    let query = supabase.from('doubts').select('*').order('created_at', { ascending: false })
    if (courseId) query = query.eq('course_id', courseId)
    if (!isAdmin) query = query.eq('user_id', user.id)
    const { data, error } = await query
    if (error) return res.status(500).json({ erro: error.message, needsSetup: error.code === '42P01' })
    return res.status(200).json({ doubts: data || [] })
  }

  // ── ENVIAR DÚVIDA (aluna ou admin) ──
  if (req.method === 'POST' && action === 'doubt') {
    const { courseId, lessonId, lessonTitle, question } = req.body || {}
    if (!question?.trim()) return res.status(400).json({ erro: 'Pergunta obrigatória.' })
    const { data, error } = await supabase.from('doubts').insert({
      course_id: courseId || null,
      lesson_id: lessonId || null,
      lesson_title: lessonTitle || null,
      user_id: user.id,
      user_email: user.email,
      user_name: user.user_metadata?.name || '',
      question: question.trim()
    }).select().single()
    if (error) return res.status(500).json({ erro: error.message, needsSetup: error.code === '42P01' })
    return res.status(201).json({ ok: true, doubt: data })
  }

  // ── RESPONDER DÚVIDA (admin only) ──
  if (req.method === 'PUT' && action === 'answer') {
    if (!isAdmin) return res.status(403).json({ erro: 'Acesso restrito.' })
    const { id, answer } = req.body || {}
    if (!id) return res.status(400).json({ erro: 'ID obrigatório.' })
    const { error } = await supabase.from('doubts')
      .update({ answer: answer || null, answered_at: answer ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── EXCLUIR DÚVIDA (admin only) ──
  if (req.method === 'DELETE' && action === 'doubt') {
    if (!isAdmin) return res.status(403).json({ erro: 'Acesso restrito.' })
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ erro: 'ID obrigatório.' })
    const { error } = await supabase.from('doubts').delete().eq('id', id)
    if (error) return res.status(500).json({ erro: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ erro: 'Método não permitido.' })
}
