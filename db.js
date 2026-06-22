const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'smanegeri_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await fn(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function insertUser({ name, email, password, role }) {
  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return null;
  const password_hash = await bcrypt.hash(password, 10);
  const result = await execute(
    'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [name, email, password_hash, role, new Date().toISOString()]
  );
  const rows = await query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS students (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      grade_level VARCHAR(64) NOT NULL,
      homeroom VARCHAR(64) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      subject VARCHAR(128) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS classes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      teacher_id BIGINT UNSIGNED NOT NULL,
      schedule VARCHAR(128) NOT NULL,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      audience VARCHAR(64) NOT NULL,
      author VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS grades (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      class_id BIGINT UNSIGNED NOT NULL,
      score INT NOT NULL,
      comment TEXT,
      recorded_at DATETIME NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function initializeDatabase() {
  await createTables();
  const adminRow = await query('SELECT id FROM users WHERE role = ?', ['admin']);
  if (adminRow.length === 0) {
    await transaction(async (conn) => {
      const admin = await insertUser({ name: 'Admin SMA Negeri', email: 'admin@smanegeri.sch.id', password: 'Admin123!', role: 'admin' });
      const teacherUser = await insertUser({ name: 'Ibu Siti', email: 'siti@smanegeri.sch.id', password: 'Guru123!', role: 'teacher' });
      const studentUser = await insertUser({ name: 'Andi Putra', email: 'andi@smanegeri.sch.id', password: 'Siswa123!', role: 'student' });
      const [teacherResult] = await conn.execute('INSERT INTO teachers (user_id, subject) VALUES (?, ?)', [teacherUser.id, 'Matematika']);
      const [studentResult] = await conn.execute('INSERT INTO students (user_id, grade_level, homeroom) VALUES (?, ?, ?)', [studentUser.id, 'XII IPA', 'XII A']);
      await conn.execute('INSERT INTO classes (name, teacher_id, schedule) VALUES (?, ?, ?)', ['Matematika XII', teacherResult.insertId, 'Senin 08:00-09:40']);
      await conn.execute('INSERT INTO announcements (title, content, audience, author, created_at) VALUES (?, ?, ?, ?, ?)', [
        'Selamat Datang',
        'Selamat datang di portal sekolah SMA Negeri. Akses pengumuman, jadwal, dan informasi penting di sini.',
        'all',
        'System',
        new Date().toISOString(),
      ]);
    });
  }
}

async function findUserByEmail(email) {
  const rows = await query('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const rows = await query('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findStudentByUserId(userId) {
  const rows = await query(
    `SELECT students.id, users.name, users.email, students.grade_level, students.homeroom
     FROM students
     JOIN users ON students.user_id = users.id
     WHERE students.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function getProfileFor(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  if (user.role === 'student') {
    const [student] = await query('SELECT grade_level, homeroom FROM students WHERE user_id = ?', [userId]);
    return { ...user, grade_level: student?.grade_level || null, homeroom: student?.homeroom || null };
  }
  if (user.role === 'teacher') {
    const [teacher] = await query('SELECT subject FROM teachers WHERE user_id = ?', [userId]);
    return { ...user, subject: teacher?.subject || null };
  }
  return user;
}

async function getDashboardFor(role, userId) {
  const [{ count: totalStudents }] = await query('SELECT COUNT(*) AS count FROM students');
  const [{ count: totalTeachers }] = await query('SELECT COUNT(*) AS count FROM teachers');
  const [{ count: totalClasses }] = await query('SELECT COUNT(*) AS count FROM classes');
  const [{ count: totalAnnouncements }] = await query('SELECT COUNT(*) AS count FROM announcements');
  const [latestAnnouncement] = await query('SELECT title, content, audience, author, created_at FROM announcements ORDER BY id DESC LIMIT 1');

  if (role === 'student') {
    const student = await findStudentByUserId(userId);
    const classes = await query(
      `SELECT classes.id, classes.name, classes.schedule, teachers.subject, users.name AS teacher_name
       FROM classes
       JOIN teachers ON classes.teacher_id = teachers.id
       JOIN users ON teachers.user_id = users.id`
    );
    return { welcome: 'Halo, ' + student.name, role, totalStudents, totalTeachers, totalClasses, totalAnnouncements, classes, latestAnnouncement };
  }

  if (role === 'teacher') {
    const user = await findUserById(userId);
    const [teacher] = await query('SELECT id, subject FROM teachers WHERE user_id = ?', [userId]);
    const classes = await query('SELECT classes.id, classes.name, classes.schedule FROM classes WHERE classes.teacher_id = ?', [teacher.id]);
    return { welcome: 'Halo, ' + user.name, role, totalStudents, totalTeachers, totalClasses, totalAnnouncements, classes, latestAnnouncement };
  }

  return { welcome: 'Halo, Admin', role, totalStudents, totalTeachers, totalClasses, totalAnnouncements, latestAnnouncement, suggestions: ['Perbarui pengumuman sekolah', 'Tambah data siswa dan guru baru', 'Kelola kelas dan jadwal'] };
}

async function listStudents() {
  return query(
    `SELECT students.id, users.name, users.email, students.grade_level, students.homeroom
     FROM students
     JOIN users ON students.user_id = users.id
     ORDER BY students.id DESC`
  );
}

async function listTeachers() {
  return query(
    `SELECT teachers.id, users.name, users.email, teachers.subject
     FROM teachers
     JOIN users ON teachers.user_id = users.id
     ORDER BY teachers.id DESC`
  );
}

async function listClasses() {
  return query(
    `SELECT classes.id, classes.name, classes.schedule, users.name AS teacher_name
     FROM classes
     JOIN teachers ON classes.teacher_id = teachers.id
     JOIN users ON teachers.user_id = users.id
     ORDER BY classes.id DESC`
  );
}

async function listAnnouncements(role) {
  const audienceSet = role === 'admin' ? ['all', 'teacher', 'student'] : ['all', role];
  const placeholders = audienceSet.map(() => '?').join(',');
  return query(
    `SELECT id, title, content, audience, author, created_at FROM announcements WHERE audience IN (${placeholders}) ORDER BY id DESC`,
    audienceSet
  );
}

async function addStudent({ name, email, grade_level, homeroom, password }) {
  const user = await insertUser({ name, email, password, role: 'student' });
  if (!user) return null;
  const info = await execute('INSERT INTO students (user_id, grade_level, homeroom) VALUES (?, ?, ?)', [user.id, grade_level, homeroom]);
  return { id: info.insertId, name: user.name, email: user.email, grade_level, homeroom };
}

async function addTeacher({ name, email, subject, password }) {
  const user = await insertUser({ name, email, password, role: 'teacher' });
  if (!user) return null;
  const info = await execute('INSERT INTO teachers (user_id, subject) VALUES (?, ?)', [user.id, subject]);
  return { id: info.insertId, name: user.name, email: user.email, subject };
}

async function addClass({ name, teacher_id, schedule }) {
  const info = await execute('INSERT INTO classes (name, teacher_id, schedule) VALUES (?, ?, ?)', [name, teacher_id, schedule]);
  const [row] = await query(
    `SELECT classes.id, classes.name, classes.schedule, users.name AS teacher_name
     FROM classes
     JOIN teachers ON classes.teacher_id = teachers.id
     JOIN users ON teachers.user_id = users.id
     WHERE classes.id = ?`,
    [info.insertId]
  );
  return row;
}

async function addAnnouncement({ title, content, audience, author }) {
  const info = await execute('INSERT INTO announcements (title, content, audience, author, created_at) VALUES (?, ?, ?, ?, ?)', [title, content, audience, author, new Date().toISOString()]);
  const [row] = await query('SELECT id, title, content, audience, author, created_at FROM announcements WHERE id = ?', [info.insertId]);
  return row;
}

async function addGrade({ student_id, class_id, score, comment }) {
  const info = await execute('INSERT INTO grades (student_id, class_id, score, comment, recorded_at) VALUES (?, ?, ?, ?, ?)', [student_id, class_id, score, comment, new Date().toISOString()]);
  return { id: info.insertId, student_id, class_id, score, comment };
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
