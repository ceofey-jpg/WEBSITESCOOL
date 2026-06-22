const path = require('path');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { initializeDatabase, findUserByEmail, findUserById, getProfileFor, getDashboardFor, listStudents, listTeachers, listClasses, listAnnouncements, addStudent, addTeacher, addClass, addAnnouncement, addGrade, findStudentByUserId } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.SESSION_SECRET || 'SMANEGERI_SECRET_2026';

initializeDatabase();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function respondError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

function authenticate(req, res, next) {
  const token = req.cookies.school_token;
  if (!token) return respondError(res, 401, 'Authentication required');

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return respondError(res, 401, 'Invalid or expired session');
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return respondError(res, 403, 'Access denied');
    }
    next();
  };
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return respondError(res, 400, 'Email and kata sandi diperlukan');

  const user = findUserByEmail(email.trim().toLowerCase());
  if (!user) return respondError(res, 401, 'Email atau kata sandi salah');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return respondError(res, 401, 'Email atau kata sandi salah');

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: '8h' });
  res.cookie('school_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });
  return res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

app.post('/api/logout', authenticate, (req, res) => {
  res.clearCookie('school_token');
  res.json({ ok: true });
});

app.get('/api/profile', authenticate, (req, res) => {
  const profile = getProfileFor(req.user.id);
  if (!profile) return respondError(res, 404, 'Profil tidak ditemukan');
  res.json({ ok: true, profile });
});

app.get('/api/dashboard', authenticate, (req, res) => {
  const dashboard = getDashboardFor(req.user.role, req.user.id);
  res.json({ ok: true, dashboard });
});

app.get('/api/session', authenticate, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/students', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    const student = findStudentByUserId(req.user.id);
    if (!student) return respondError(res, 404, 'Data siswa tidak ditemukan');
    return res.json({ ok: true, students: [student] });
  }
  if (!['admin', 'teacher'].includes(req.user.role)) return respondError(res, 403, 'Akses ditolak');
  const students = listStudents();
  res.json({ ok: true, students });
});

app.post('/api/students', authenticate, requireRole('admin'), (req, res) => {
  const { name, email, grade_level, homeroom, password } = req.body || {};
  if (!name || !email || !grade_level || !homeroom || !password) {
    return respondError(res, 400, 'Semua field siswa wajib diisi');
  }
  const student = addStudent({ name: name.trim(), email: email.trim().toLowerCase(), grade_level: grade_level.trim(), homeroom: homeroom.trim(), password: password.trim() });
  if (!student) return respondError(res, 400, 'Email siswa sudah terdaftar');
  res.json({ ok: true, student });
});

app.get('/api/teachers', authenticate, requireRole('admin'), (req, res) => {
  const teachers = listTeachers();
  res.json({ ok: true, teachers });
});

app.post('/api/teachers', authenticate, requireRole('admin'), (req, res) => {
  const { name, email, subject, password } = req.body || {};
  if (!name || !email || !subject || !password) {
    return respondError(res, 400, 'Semua field guru wajib diisi');
  }
  const teacher = addTeacher({ name: name.trim(), email: email.trim().toLowerCase(), subject: subject.trim(), password: password.trim() });
  if (!teacher) return respondError(res, 400, 'Email guru sudah terdaftar');
  res.json({ ok: true, teacher });
});

app.get('/api/classes', authenticate, (req, res) => {
  const classes = listClasses();
  res.json({ ok: true, classes });
});

app.post('/api/classes', authenticate, requireRole('admin'), (req, res) => {
  const { name, teacher_id, schedule } = req.body || {};
  if (!name || !teacher_id || !schedule) {
    return respondError(res, 400, 'Nama kelas, guru, dan jadwal wajib diisi');
  }
  const schoolClass = addClass({ name: name.trim(), teacher_id, schedule: schedule.trim() });
  res.json({ ok: true, class: schoolClass });
});

app.get('/api/announcements', authenticate, (req, res) => {
  const announcements = listAnnouncements(req.user.role);
  res.json({ ok: true, announcements });
});

app.post('/api/announcements', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  const { title, content, audience } = req.body || {};
  if (!title || !content || !audience) {
    return respondError(res, 400, 'Judul, isi, dan audiens pengumuman wajib diisi');
  }
  const announcement = addAnnouncement({ title: title.trim(), content: content.trim(), audience: audience.trim().toLowerCase(), author: req.user.name });
  res.json({ ok: true, announcement });
});

app.post('/api/grades', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  const { student_id, class_id, score, comment } = req.body || {};
  if (!student_id || !class_id || typeof score !== 'number') {
    return respondError(res, 400, 'ID siswa, ID kelas, dan skor wajib diisi');
  }
  const grade = addGrade({ student_id, class_id, score, comment: comment ? comment.trim() : '' });
  res.json({ ok: true, grade });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
