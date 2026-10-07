const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { courseId, email } = req.query
  if (!courseId || !email) return res.status(400).json({ hasAccess: false })

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Busca usuário pelo email
    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users?.users?.find(u => u.email === email)
    if (!user) return res.status(200).json({ hasAccess: false })

    // Verifica se tem acesso ao curso
    const { data: access } = await supabase
      .from('user_courses')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .single()

    return res.status(200).json({ hasAccess: !!access })
  } catch (err) {
    console.error('check-access error:', err)
    return res.status(200).json({ hasAccess: false })
  }
}
