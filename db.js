const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const DB_FILE = path.join(__dirname, 'school.db');
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      grade_level TEXT NOT NULL,
      homeroom TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_id INTEGER NOT NULL,
      schedule TEXT NOT NULL,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      audience TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      comment TEXT,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );
  `);
}

function transaction(fn) {
  const trx = db.transaction(fn);
  trx();
}

function insertUser({ name, email, password, role }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return null;
  const password_hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(name, email, password_hash, role, new Date().toISOString());
  return db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function initializeDatabase() {
  createTables();

  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    transaction(() => {
      const admin = insertUser({ name: 'Admin SMA Negeri', email: 'admin@smanegeri.sch.id', password: 'Admin123!', role: 'admin' });
      const teacherUser = insertUser({ name: 'Ibu Siti', email: 'siti@smanegeri.sch.id', password: 'Guru123!', role: 'teacher' });
      const studentUser = insertUser({ name: 'Andi Putra', email: 'andi@smanegeri.sch.id', password: 'Siswa123!', role: 'student' });
      const teacher = db.prepare('INSERT INTO teachers (user_id, subject) VALUES (?, ?)').run(teacherUser.id, 'Matematika');
      const student = db.prepare('INSERT INTO students (user_id, grade_level, homeroom) VALUES (?, ?, ?)').run(studentUser.id, 'XII IPA', 'XII A');
      const classInfo = db.prepare('INSERT INTO classes (name, teacher_id, schedule) VALUES (?, ?, ?)').run('Matematika XII', teacher.lastInsertRowid, 'Senin 08:00-09:40');
      db.prepare('INSERT INTO announcements (title, content, audience, author, created_at) VALUES (?, ?, ?, ?, ?)').run('Selamat Datang', 'Selamat datang di portal sekolah SMA Negeri. Akses pengumuman, jadwal, dan informasi penting di sini.', 'all', 'System', new Date().toISOString());
      db.prepare('INSERT INTO grades (student_id, class_id, score, comment, recorded_at) VALUES (?, ?, ?, ?, ?)').run(student.lastInsertRowid, classInfo.lastInsertRowid, 88, 'Rata-rata baik, tingkatkan latihan soal.', new Date().toISOString());
    });
  }
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
}

function findStudentByUserId(userId) {
  return db.prepare(
    `SELECT students.id, users.name, users.email, students.grade_level, students.homeroom
     FROM students
     JOIN users ON students.user_id = users.id
     WHERE students.user_id = ?`
  ).get(userId);
}

function getProfileFor(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  if (user.role === 'student') {
    const student = db.prepare('SELECT grade_level, homeroom FROM students WHERE user_id = ?').get(userId);
    return { ...user, grade_level: student?.grade_level || null, homeroom: student?.homeroom || null };
  }
  if (user.role === 'teacher') {
    const teacher = db.prepare('SELECT subject FROM teachers WHERE user_id = ?').get(userId);
    return { ...user, subject: teacher?.subject || null };
  }
  return user;
}

function getDashboardFor(role, userId) {
  const totalStudents = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
  const totalTeachers = db.prepare('SELECT COUNT(*) AS count FROM teachers').get().count;
  const totalClasses = db.prepare('SELECT COUNT(*) AS count FROM classes').get().count;
  const latestAnnouncement = db.prepare('SELECT title, content, audience, author, created_at FROM announcements ORDER BY id DESC LIMIT 1').get();
  if (role === 'student') {
    const student = findStudentByUserId(userId);
    const classes = db.prepare(
      `SELECT classes.id, classes.name, classes.schedule, teachers.subject, users.name AS teacher_name
      FROM classes
      JOIN teachers ON classes.teacher_id = teachers.id
      JOIN users ON teachers.user_id = users.id`
    ).all();
    return { welcome: 'Halo, ' + student.name, role, totalStudents, totalTeachers, totalClasses, classes, latestAnnouncement };
  }
  if (role === 'teacher') {
    const user = findUserById(userId);
    const teacher = db.prepare('SELECT id, subject FROM teachers WHERE user_id = ?').get(userId);
    const classes = db.prepare(
      `SELECT classes.id, classes.name, classes.schedule
       FROM classes WHERE classes.teacher_id = ?`
    ).all(teacher.id);
    return { welcome: 'Halo, ' + user.name, role, totalStudents, totalTeachers, totalClasses, classes, latestAnnouncement };
  }
  return { welcome: 'Halo, Admin', role, totalStudents, totalTeachers, totalClasses, latestAnnouncement, suggestions: ['Perbarui pengumuman sekolah', 'Tambah data siswa dan guru baru', 'Kelola kelas dan jadwal'] };
}

function listStudents() {
  return db.prepare(
    `SELECT students.id, users.name, users.email, students.grade_level, students.homeroom
     FROM students
     JOIN users ON students.user_id = users.id
     ORDER BY students.id DESC`
  ).all();
}

function listTeachers() {
  return db.prepare(
    `SELECT teachers.id, users.name, users.email, teachers.subject
     FROM teachers
     JOIN users ON teachers.user_id = users.id
     ORDER BY teachers.id DESC`
  ).all();
}

function listClasses() {
  return db.prepare(
    `SELECT classes.id, classes.name, classes.schedule, users.name AS teacher_name
     FROM classes
     JOIN teachers ON classes.teacher_id = teachers.id
     JOIN users ON teachers.user_id = users.id
     ORDER BY classes.id DESC`
  ).all();
}

function listAnnouncements(role) {
  const audienceSet = role === 'admin' ? ['all', 'teacher', 'student'] : ['all', role];
  const placeholders = audienceSet.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, title, content, audience, author, created_at FROM announcements WHERE audience IN (${placeholders}) ORDER BY id DESC`
  ).all(...audienceSet);
}

function addStudent({ name, email, grade_level, homeroom, password }) {
  const user = insertUser({ name, email, password, role: 'student' });
  if (!user) return null;
  const info = db.prepare('INSERT INTO students (user_id, grade_level, homeroom) VALUES (?, ?, ?)').run(user.id, grade_level, homeroom);
  return { id: info.lastInsertRowid, name: user.name, email: user.email, grade_level, homeroom };
}

function addTeacher({ name, email, subject, password }) {
  const user = insertUser({ name, email, password, role: 'teacher' });
  if (!user) return null;
  const info = db.prepare('INSERT INTO teachers (user_id, subject) VALUES (?, ?)').run(user.id, subject);
  return { id: info.lastInsertRowid, name: user.name, email: user.email, subject };
}

function addClass({ name, teacher_id, schedule }) {
  const info = db.prepare('INSERT INTO classes (name, teacher_id, schedule) VALUES (?, ?, ?)').run(name, teacher_id, schedule);
  const row = db.prepare(
    `SELECT classes.id, classes.name, classes.schedule, users.name AS teacher_name
     FROM classes
     JOIN teachers ON classes.teacher_id = teachers.id
     JOIN users ON teachers.user_id = users.id
     WHERE classes.id = ?`
  ).get(info.lastInsertRowid);
  return row;
}

function addAnnouncement({ title, content, audience, author }) {
  const info = db.prepare('INSERT INTO announcements (title, content, audience, author, created_at) VALUES (?, ?, ?, ?, ?)').run(title, content, audience, author, new Date().toISOString());
  return db.prepare('SELECT id, title, content, audience, author, created_at FROM announcements WHERE id = ?').get(info.lastInsertRowid);
}

function addGrade({ student_id, class_id, score, comment }) {
  const info = db.prepare('INSERT INTO grades (student_id, class_id, score, comment, recorded_at) VALUES (?, ?, ?, ?, ?)').run(student_id, class_id, score, comment, new Date().toISOString());
  return { id: info.lastInsertRowid, student_id, class_id, score, comment };
}

module.exports = {
  initializeDatabase,
  findUserByEmail,
  findUserById,
  getProfileFor,
  getDashboardFor,
  listStudents,
  listTeachers,
  listClasses,
  listAnnouncements,
  addStudent,
  addTeacher,
  addClass,
  addAnnouncement,
  addGrade,
  findStudentByUserId,
};
