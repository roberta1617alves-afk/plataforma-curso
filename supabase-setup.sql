-- ─────────────────────────────────────────────
--  RODE ESTE SQL NO SUPABASE > SQL Editor
-- ─────────────────────────────────────────────

-- Tabela de cursos
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Meu Curso',
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de acesso das alunas por curso
CREATE TABLE IF NOT EXISTS course_access (
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id)
);

-- Progresso e notas por usuária / curso / aula
CREATE TABLE IF NOT EXISTS user_progress (
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  lesson_id TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id, lesson_id)
);

-- Ativar RLS em todas
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- Cursos: qualquer autenticada pode ler
CREATE POLICY "courses_select" ON courses
  FOR SELECT TO authenticated USING (true);

-- Acesso: cada usuária vê só os seus
CREATE POLICY "access_select" ON course_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Progresso: cada usuária gerencia o próprio
CREATE POLICY "progress_all" ON user_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
