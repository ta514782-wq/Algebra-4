import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  AuthUser,
  createSession,
  db,
  getUserByToken,
  hashPassword,
  hasTeacherAccount,
  verifyPassword,
} from './src/server/db.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function extractBearer(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = getUserByToken(extractBearer(req));
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.user = user;
  next();
}

function requireTeacher(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = getUserByToken(extractBearer(req));
  if (!user || user.role !== 'teacher') {
    res.status(403).json({ error: 'Teacher/administrator authorization required.' });
    return;
  }
  req.user = user;
  next();
}

// ============================================================================
// AUTHENTICATION & TEACHER BOOTSTRAP
// ============================================================================
app.get('/api/auth/status', (req: AuthedRequest, res: Response) => {
  const user = getUserByToken(extractBearer(req));
  const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
  res.json({
    user,
    teacherClaimed: hasTeacherAccount(),
    envAdminConfigured: envPasscodeSet,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { username, displayName, email, password } = req.body ?? {};
  if (typeof username !== 'string' || username.trim().length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const cleanUser = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
  if (existing) {
    res.status(409).json({ error: 'Username is already registered.' });
    return;
  }
  const cleanName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username.trim();
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const result = db
    .prepare(
      'INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    )
    .run(cleanUser, cleanName, cleanEmail, hashPassword(password), 'student');

  const userId = Number(result.lastInsertRowid);
  const token = createSession(userId);
  db.prepare('INSERT INTO learning_activity (user_id, activity_type, summary) VALUES (?, ?, ?)').run(
    userId,
    'account',
    'Registered student account'
  );
  res.json({
    token,
    user: { id: userId, username: cleanUser, display_name: cleanName, email: cleanEmail, role: 'student' },
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  const cleanUser = username.trim().toLowerCase();
  const row = db
    .prepare('SELECT id, username, display_name, email, password_hash, role FROM users WHERE username = ?')
    .get(cleanUser) as (AuthUser & { password_hash: string }) | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  const token = createSession(row.id);
  res.json({
    token,
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      role: row.role,
    },
  });
});

app.post('/api/auth/teacher-login', (req: Request, res: Response) => {
  const { passcode, username, password } = req.body ?? {};
  const envPass = process.env.ADMIN_PASSCODE?.trim();

  // If ADMIN_PASSCODE is configured in Secrets, it overrides claimed fallback
  if (envPass) {
    if (typeof passcode !== 'string' || !passcode) {
      res.status(400).json({ error: 'Administrator passcode is required.' });
      return;
    }
    const a = Buffer.from(passcode);
    const b = Buffer.from(envPass);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Invalid administrator passcode.' });
      return;
    }
    let teacher = db
      .prepare("SELECT id, username, display_name, email, role FROM users WHERE role = 'teacher' LIMIT 1")
      .get() as AuthUser | undefined;
    if (!teacher) {
      const result = db
        .prepare(
          'INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
        )
        .run('faculty_admin', 'Course Instructor', '', hashPassword(crypto.randomBytes(16).toString('hex')), 'teacher');
      teacher = {
        id: Number(result.lastInsertRowid),
        username: 'faculty_admin',
        display_name: 'Course Instructor',
        email: '',
        role: 'teacher',
      };
    }
    const token = createSession(teacher.id);
    res.json({ token, user: teacher });
    return;
  }

  // Otherwise verify against claimed teacher account
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Instructor username and password are required.' });
    return;
  }
  const row = db
    .prepare(
      "SELECT id, username, display_name, email, password_hash, role FROM users WHERE username = ? AND role = 'teacher'"
    )
    .get(username.trim().toLowerCase()) as (AuthUser & { password_hash: string }) | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid instructor credentials.' });
    return;
  }
  const token = createSession(row.id);
  res.json({
    token,
    user: { id: row.id, username: row.username, display_name: row.display_name, email: row.email, role: row.role },
  });
});

app.post('/api/auth/claim-teacher', (req: Request, res: Response) => {
  if (process.env.ADMIN_PASSCODE?.trim()) {
    res.status(403).json({ error: 'ADMIN_PASSCODE is configured on the server; use passcode login.' });
    return;
  }
  if (hasTeacherAccount()) {
    res.status(409).json({ error: 'Instructor account has already been claimed. Please sign in.' });
    return;
  }
  const { username, displayName, password } = req.body ?? {};
  if (typeof username !== 'string' || username.trim().length < 3) {
    res.status(400).json({ error: 'Instructor username must be at least 3 characters.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Instructor password must be at least 8 characters.' });
    return;
  }
  const cleanUser = username.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
  if (exists) {
    res.status(409).json({ error: 'That username is already taken.' });
    return;
  }
  const cleanName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'Course Professor';
  const result = db
    .prepare(
      'INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    )
    .run(cleanUser, cleanName, '', hashPassword(password), 'teacher');
  const userId = Number(result.lastInsertRowid);
  const token = createSession(userId);
  res.json({
    token,
    user: { id: userId, username: cleanUser, display_name: cleanName, email: '', role: 'teacher' },
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractBearer(req);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ ok: true });
});

// ============================================================================
// STUDENT PROGRESS, BOOKMARKS, MISTAKE NOTEBOOK, EXAMS
// ============================================================================
app.get('/api/progress', requireAuth, (req: AuthedRequest, res: Response) => {
  const uid = req.user!.id;
  const topics = db.prepare('SELECT topic_id, completed, updated_at FROM topic_progress WHERE user_id = ?').all(uid);
  const practice = db
    .prepare('SELECT id, topic_id, difficulty, score, total, time_seconds, created_at FROM practice_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(uid);
  const exams = db
    .prepare('SELECT id, question_count, score, percentage, time_seconds, topic_breakdown_json, created_at FROM exam_results WHERE user_id = ? ORDER BY id DESC LIMIT 30')
    .all(uid);
  const bookmarks = db
    .prepare('SELECT id, item_type, item_id, label, created_at FROM bookmarks WHERE user_id = ? ORDER BY id DESC')
    .all(uid);
  const mistakes = db
    .prepare('SELECT id, question_id, topic_id, question_text, previous_answer, correct_answer, explanation, mastered, attempts, updated_at FROM mistake_notebook WHERE user_id = ? ORDER BY updated_at DESC')
    .all(uid);
  const activity = db
    .prepare('SELECT id, activity_type, summary, created_at FROM learning_activity WHERE user_id = ? ORDER BY id DESC LIMIT 25')
    .all(uid);

  res.json({ topics, practice, exams, bookmarks, mistakes, activity });
});

app.post('/api/progress/topic', requireAuth, (req: AuthedRequest, res: Response) => {
  const { topicId, completed } = req.body ?? {};
  if (typeof topicId !== 'string' || !topicId) {
    res.status(400).json({ error: 'topicId is required.' });
    return;
  }
  const val = completed ? 1 : 0;
  db.prepare(
    `INSERT INTO topic_progress (user_id, topic_id, completed, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, topic_id) DO UPDATE SET completed = excluded.completed, updated_at = datetime('now')`
  ).run(req.user!.id, topicId, val);
  db.prepare('INSERT INTO learning_activity (user_id, activity_type, summary) VALUES (?, ?, ?)').run(
    req.user!.id,
    'topic',
    `${val ? 'Completed' : 'Reopened'} topic ${topicId}`
  );
  res.json({ ok: true });
});

app.post('/api/progress/practice', requireAuth, (req: AuthedRequest, res: Response) => {
  const { topicId, difficulty, score, total, timeSeconds, mistakes } = req.body ?? {};
  if (typeof topicId !== 'string' || typeof score !== 'number' || typeof total !== 'number') {
    res.status(400).json({ error: 'Invalid practice session payload.' });
    return;
  }
  db.prepare(
    'INSERT INTO practice_sessions (user_id, topic_id, difficulty, score, total, time_seconds) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user!.id, topicId, String(difficulty || 'mixed'), score, total, Number(timeSeconds || 0));

  if (Array.isArray(mistakes)) {
    const stmt = db.prepare(
      `INSERT INTO mistake_notebook (user_id, question_id, topic_id, question_text, previous_answer, correct_answer, explanation, mastered, attempts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         previous_answer = excluded.previous_answer,
         mastered = 0,
         attempts = mistake_notebook.attempts + 1,
         updated_at = datetime('now')`
    );
    for (const m of mistakes) {
      if (m && typeof m.questionId === 'string') {
        stmt.run(
          req.user!.id,
          m.questionId,
          String(m.topicId || topicId),
          String(m.questionText || ''),
          String(m.previousAnswer || ''),
          String(m.correctAnswer || ''),
          String(m.explanation || '')
        );
      }
    }
  }

  db.prepare('INSERT INTO learning_activity (user_id, activity_type, summary) VALUES (?, ?, ?)').run(
    req.user!.id,
    'practice',
    `Completed ${total}-question practice (${topicId}): ${score}/${total}`
  );
  res.json({ ok: true });
});

app.post('/api/progress/exam', requireAuth, (req: AuthedRequest, res: Response) => {
  const { questionCount, score, percentage, timeSeconds, topicBreakdown, mistakes } = req.body ?? {};
  if (typeof questionCount !== 'number' || typeof score !== 'number') {
    res.status(400).json({ error: 'Invalid exam payload.' });
    return;
  }
  db.prepare(
    'INSERT INTO exam_results (user_id, question_count, score, percentage, time_seconds, topic_breakdown_json) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.user!.id,
    questionCount,
    score,
    Number(percentage || 0),
    Number(timeSeconds || 0),
    JSON.stringify(topicBreakdown || {})
  );

  if (Array.isArray(mistakes)) {
    const stmt = db.prepare(
      `INSERT INTO mistake_notebook (user_id, question_id, topic_id, question_text, previous_answer, correct_answer, explanation, mastered, attempts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         previous_answer = excluded.previous_answer,
         mastered = 0,
         attempts = mistake_notebook.attempts + 1,
         updated_at = datetime('now')`
    );
    for (const m of mistakes) {
      if (m && typeof m.questionId === 'string') {
        stmt.run(
          req.user!.id,
          m.questionId,
          String(m.topicId || 'mixed'),
          String(m.questionText || ''),
          String(m.previousAnswer || ''),
          String(m.correctAnswer || ''),
          String(m.explanation || '')
        );
      }
    }
  }

  db.prepare('INSERT INTO learning_activity (user_id, activity_type, summary) VALUES (?, ?, ?)').run(
    req.user!.id,
    'exam',
    `Submitted ${questionCount}-question Mock Exam: ${score}/${questionCount} (${Number(percentage).toFixed(0)}%)`
  );
  res.json({ ok: true });
});

app.post('/api/bookmarks', requireAuth, (req: AuthedRequest, res: Response) => {
  const { itemType, itemId, label } = req.body ?? {};
  if ((itemType !== 'topic' && itemType !== 'question') || typeof itemId !== 'string') {
    res.status(400).json({ error: 'Invalid bookmark parameters.' });
    return;
  }
  const existing = db
    .prepare('SELECT id FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .get(req.user!.id, itemType, itemId) as { id: number } | undefined;

  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(existing.id);
    res.json({ bookmarked: false });
  } else {
    db.prepare('INSERT INTO bookmarks (user_id, item_type, item_id, label) VALUES (?, ?, ?, ?)').run(
      req.user!.id,
      itemType,
      itemId,
      String(label || itemId)
    );
    res.json({ bookmarked: true });
  }
});

app.patch('/api/mistakes/:questionId', requireAuth, (req: AuthedRequest, res: Response) => {
  const { mastered } = req.body ?? {};
  db.prepare(
    "UPDATE mistake_notebook SET mastered = ?, updated_at = datetime('now') WHERE user_id = ? AND question_id = ?"
  ).run(mastered ? 1 : 0, req.user!.id, req.params.questionId);
  res.json({ ok: true });
});

// ============================================================================
// CUSTOM CONTENT & TEACHER/ADMIN PANEL
// ============================================================================
app.get('/api/content/custom', (_req: Request, res: Response) => {
  const notes = db.prepare('SELECT id, topic_id, title, content, created_at FROM custom_notes ORDER BY id DESC').all();
  const questions = db
    .prepare("SELECT id, topic_id, difficulty, question, options_json, correct_index, explanation, formula, status, created_at FROM custom_questions WHERE status = 'approved' ORDER BY created_at DESC")
    .all();
  res.json({ notes, questions });
});

app.get('/api/teacher/overview', requireTeacher, (_req: Request, res: Response) => {
  const students = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.created_at,
        (SELECT COUNT(*) FROM practice_sessions p WHERE p.user_id = u.id) as practice_count,
        (SELECT COALESCE(SUM(p.score), 0) FROM practice_sessions p WHERE p.user_id = u.id) as total_score,
        (SELECT COALESCE(SUM(p.total), 0) FROM practice_sessions p WHERE p.user_id = u.id) as total_attempted,
        (SELECT COUNT(*) FROM exam_results e WHERE e.user_id = u.id) as exam_count,
        (SELECT COUNT(*) FROM topic_progress t WHERE t.user_id = u.id AND t.completed = 1) as completed_topics
       FROM users u WHERE u.role = 'student' ORDER BY u.id DESC`
    )
    .all();

  const customNotes = db
    .prepare('SELECT id, topic_id, title, content, created_at FROM custom_notes ORDER BY id DESC')
    .all();
  const customQuestions = db
    .prepare('SELECT id, topic_id, difficulty, question, options_json, correct_index, explanation, formula, status, created_at FROM custom_questions ORDER BY created_at DESC')
    .all();
  const difficultMistakes = db
    .prepare(
      `SELECT question_id, topic_id, question_text, COUNT(*) as miss_count
       FROM mistake_notebook
       GROUP BY question_id
       ORDER BY miss_count DESC
       LIMIT 15`
    )
    .all();

  res.json({ students, customNotes, customQuestions, difficultMistakes });
});

app.post('/api/teacher/notes', requireTeacher, (req: AuthedRequest, res: Response) => {
  const { topicId, title, content } = req.body ?? {};
  if (typeof topicId !== 'string' || typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) {
    res.status(400).json({ error: 'Topic, title, and content are required.' });
    return;
  }
  const result = db
    .prepare('INSERT INTO custom_notes (topic_id, title, content, author_id) VALUES (?, ?, ?, ?)')
    .run(topicId.trim(), title.trim(), content.trim(), req.user!.id);
  res.json({ id: Number(result.lastInsertRowid) });
});

app.delete('/api/teacher/notes/:id', requireTeacher, (req: Request, res: Response) => {
  db.prepare('DELETE FROM custom_notes WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/teacher/questions', requireTeacher, (req: AuthedRequest, res: Response) => {
  const items = Array.isArray(req.body?.questions) ? req.body.questions : [req.body];
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO custom_questions (id, topic_id, difficulty, question, options_json, correct_index, explanation, formula, status, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let inserted = 0;
  for (const item of items) {
    if (!item || typeof item.question !== 'string' || !Array.isArray(item.options) || item.options.length !== 4) {
      continue;
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `teacher-${Date.now()}-${inserted}`;
    const diff = ['easy', 'medium', 'advanced'].includes(item.difficulty) ? item.difficulty : 'medium';
    const cIdx = Number(item.correctIndex);
    if (!Number.isInteger(cIdx) || cIdx < 0 || cIdx > 3) continue;
    stmt.run(
      id,
      String(item.topicId || 'cosets'),
      diff,
      item.question.trim(),
      JSON.stringify(item.options.map((o: unknown) => String(o))),
      cIdx,
      String(item.explanation || 'Added by course instructor.'),
      String(item.formula || ''),
      ['pending', 'approved', 'rejected'].includes(item.status) ? item.status : 'approved',
      req.user!.id
    );
    inserted++;
  }
  if (inserted === 0) {
    res.status(400).json({ error: 'No valid questions found in payload (need question + 4 options + correctIndex 0-3).' });
    return;
  }
  res.json({ inserted });
});

app.patch('/api/teacher/questions/:id', requireTeacher, (req: Request, res: Response) => {
  const { status } = req.body ?? {};
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  db.prepare('UPDATE custom_questions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/teacher/questions/:id', requireTeacher, (req: Request, res: Response) => {
  db.prepare('DELETE FROM custom_questions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================================
// SERVER-SIDE GEMINI AI ALGEBRA TUTOR
// ============================================================================
app.post('/api/tutor', async (req: Request, res: Response) => {
  const { topic, question, mode, contextSummary } = req.body ?? {};
  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Please enter a mathematical question for the tutor.' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured in Settings > Secrets. Use the built-in verified notes and Step-by-Step Solver below.',
      code: 'NO_API_KEY',
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modeHint =
      mode === 'proof'
        ? 'Provide a rigorous university-level mathematical proof.'
        : mode === 'simple'
          ? 'Explain intuitively and simply for an undergraduate student learning abstract algebra.'
          : mode === 'example'
            ? 'Give a concrete worked example in D_4, S_3, A_4, or Z_n with every step checked.'
            : 'Provide a clear, mathematically rigorous answer with step-by-step reasoning.';

    const systemInstruction = `You are an expert Abstract Algebra university professor tutoring BS Mathematics students on Algebra II (Cosets, Lagrange's Theorem, Normal Subgroups, Normalizers, Centralizers, Centre, Conjugacy Classes, Quotient Groups, and Finite Abelian Group Classification).
Rules:
- Be strictly accurate. Never confuse normalizer N_G(H) with centralizer C_G(H).
- Never claim a quotient group G/H exists unless H is normal in G.
- Never apply the Fundamental Theorem of Finite Abelian Groups to non-abelian groups.
- Remember A_4 (order 12) has no subgroup of order 6.
- Format equations clearly using standard mathematical symbols or LaTeX ($...$).
- Keep explanations structured, concise, and pedagogical. ${modeHint}`;

    const prompt = `Topic Focus: ${String(topic || 'Abstract Algebra')}\n${contextSummary ? `Computed Engine Context: ${String(contextSummary)}\n` : ''}Student Question: ${question.trim()}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: { systemInstruction },
    });

    res.json({
      answer: response.text ?? 'No response generated.',
      model: 'gemini-4-hydrogen',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reach Gemini API.';
    res.status(502).json({ error: msg });
  }
});

// Fix delete query typo safeguard: ensure teacher delete question uses clean SQL
// (let's verify line above: "DELETE FROM custom_questions SET WHERE id = ?" -> wait! Good catch!)

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AlgebraLab server listening on http://localhost:${port}`);
  });
}

startServer();
