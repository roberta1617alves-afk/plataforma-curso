const { createClient } = require('@supabase/supabase-js')

// Usa service key no servidor — ignora RLS do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  // Verifica JWT da aluna
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ erro: 'Não autenticada.' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ erro: 'Sessão inválida.' })

  // Admin não usa este endpoint
  if (user.email === process.env.ADMIN_EMAIL) {
    return res.status(403).json({ erro: 'Admin deve usar o painel admin.' })
  }

  // Busca cursos da aluna via service key (100% server-side)
  const { data: accessRows, error: accessErr } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)

  if (accessErr) return res.status(500).json({ erro: accessErr.message })
  if (!accessRows || accessRows.length === 0) {
    return res.status(200).json({ courses: [] })
  }

  const courseIds = accessRows.map(r => r.course_id)

  // Busca dados dos cursos — só os que a aluna tem acesso
  const { data: courses, error: coursesErr } = await supabase
    .from('courses')
    .select('id, name, data')
    .in('id', courseIds)

  if (coursesErr) return res.status(500).json({ erro: coursesErr.message })

  return res.status(200).json({ courses: courses || [] })
}
