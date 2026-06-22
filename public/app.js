const app = document.getElementById('app');

const state = {
  user: null,
  profile: null,
  dashboard: null,
  students: [],
  teachers: [],
  classes: [],
  announcements: [],
  error: null,
  info: null,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function asJson(response) {
  return response.json().then((body) => {
    if (!response.ok) throw new Error(body.message || 'Terjadi kesalahan');
    return body;
  });
}

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return asJson(res);
}

function showMessage(message, type = 'success') {
  setState({ info: type === 'success' ? message : null, error: type === 'error' ? message : null });
  window.setTimeout(() => setState({ error: null, info: null }), 4000);
}

async function fetchDashboard() {
  const { dashboard } = await api('dashboard');
  setState({ dashboard });
}

async function fetchProfile() {
  const { profile } = await api('profile');
  setState({ profile });
}

async function fetchLists() {
  if (!state.user) return;
  if (state.user.role === 'admin') {
    const [studentsRes, teachersRes, classesRes] = await Promise.all([
      api('students'),
      api('teachers'),
      api('classes'),
    ]);
    setState({ students: studentsRes.students, teachers: teachersRes.teachers, classes: classesRes.classes });
  } else {
    const [studentsRes, classesRes] = await Promise.all([api('students'), api('classes')]);
    setState({ students: studentsRes.students, classes: classesRes.classes });
  }
  const announcementsRes = await api('announcements');
  setState({ announcements: announcementsRes.announcements });
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value.trim();
  const password = form.password.value.trim();
  if (!email || !password) return showMessage('Email dan kata sandi wajib diisi', 'error');

  try {
    const res = await api('login', { method: 'POST', body: { email, password } });
    setState({ user: res.user });
    await Promise.all([fetchProfile(), fetchDashboard(), fetchLists()]);
    showMessage('Berhasil masuk', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleLogout() {
  await api('logout', { method: 'POST' });
  setState({ user: null, profile: null, dashboard: null, students: [], teachers: [], classes: [], announcements: [] });
  showMessage('Berhasil keluar', 'success');
}

async function handleCreateStudent(event) {
  event.preventDefault();
  const form = event.target;
  const body = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    grade_level: form.grade_level.value.trim(),
    homeroom: form.homeroom.value.trim(),
    password: form.password.value.trim(),
  };
  try {
    const res = await api('students', { method: 'POST', body });
    setState({ students: [res.student, ...state.students] });
    showMessage('Data siswa berhasil ditambahkan', 'success');
    form.reset();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleCreateTeacher(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const res = await api('teachers', { method: 'POST', body: {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      password: form.password.value.trim(),
    }});
    setState({ teachers: [res.teacher, ...state.teachers] });
    showMessage('Data guru berhasil ditambahkan', 'success');
    form.reset();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleCreateClass(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const res = await api('classes', { method: 'POST', body: {
      name: form.name.value.trim(),
      teacher_id: Number(form.teacher_id.value),
      schedule: form.schedule.value.trim(),
    }});
    setState({ classes: [res.class, ...state.classes] });
    showMessage('Kelas berhasil dibuat', 'success');
    form.reset();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function handleCreateAnnouncement(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const res = await api('announcements', { method: 'POST', body: {
      title: form.title.value.trim(),
      content: form.content.value.trim(),
      audience: form.audience.value,
    }});
    setState({ announcements: [res.announcement, ...state.announcements] });
    showMessage('Pengumuman berhasil dibuat', 'success');
    form.reset();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderLogin() {
  return `
    <div class="card">
      <div class="heading">
        <div>
          <h1>Portal SMA Negeri</h1>
          <p>Masuk untuk mengelola data sekolah dan melihat informasi penting.</p>
        </div>
      </div>
      <form id="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" placeholder="admin@smanegeri.sch.id" required />
        </div>
        <div class="form-group">
          <label for="password">Kata Sandi</label>
          <input id="password" name="password" type="password" placeholder="Kata sandi" required />
        </div>
        <button type="submit">Masuk</button>
      </form>
    </div>
  `;
}

function renderTopbar() {
  return `
    <div class="topbar card">
      <div>
        <h2>Halo, ${state.user.name}</h2>
        <div class="badge">Role: ${state.user.role}</div>
      </div>
      <button onclick="window.handleLogout()">Keluar</button>
    </div>
  `;
}

function renderOverviewCards() {
  if (!state.dashboard) return '';
  return `
    <div class="grid grid-3">
      <div class="card">
        <h3>Total Siswa</h3>
        <p class="badge">${state.dashboard.totalStudents}</p>
      </div>
      <div class="card">
        <h3>Total Guru</h3>
        <p class="badge">${state.dashboard.totalTeachers}</p>
      </div>
      <div class="card">
        <h3>Total Kelas</h3>
        <p class="badge">${state.dashboard.totalClasses}</p>
      </div>
      <div class="card">
        <h3>Total Pengumuman</h3>
        <p class="badge">${state.dashboard.totalAnnouncements}</p>
      </div>
    </div>
  `;
}

function renderAnnouncements() {
  return `
    <div class="card">
      <div class="heading">
        <div>
          <h2>Pengumuman Terbaru</h2>
          <p>Informasi penting untuk semua pengguna.</p>
        </div>
      </div>
      <div class="grid">
        ${state.announcements.slice(0, 4).map((item) => `
          <div class="card" style="padding:18px;">
            <h4>${item.title}</h4>
            <p>${item.content}</p>
            <p style="font-size:0.9rem;color:#94a3b8;margin-top:10px;">Untuk: ${item.audience} • ${new Date(item.created_at).toLocaleString('id-ID')}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderStudentTable() {
  if (!state.students.length) return '<p>Tidak ada data siswa.</p>';
  return `
    <table class="table">
      <thead>
        <tr><th>Nama</th><th>Email</th><th>Rombel</th><th>Kelas</th></tr>
      </thead>
      <tbody>
        ${state.students.map((student) => `
          <tr>
            <td>${student.name}</td>
            <td>${student.email}</td>
            <td>${student.homeroom}</td>
            <td>${student.grade_level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTeacherTable() {
  if (!state.teachers.length) return '<p>Tidak ada data guru.</p>';
  return `
    <table class="table">
      <thead>
        <tr><th>Nama</th><th>Email</th><th>Mata Pelajaran</th></tr>
      </thead>
      <tbody>
        ${state.teachers.map((teacher) => `
          <tr>
            <td>${teacher.name}</td>
            <td>${teacher.email}</td>
            <td>${teacher.subject}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderClassTable() {
  if (!state.classes.length) return '<p>Tidak ada data kelas.</p>';
  return `
    <table class="table">
      <thead>
        <tr><th>Nama Kelas</th><th>Guru</th><th>Jadwal</th></tr>
      </thead>
      <tbody>
        ${state.classes.map((schoolClass) => `
          <tr>
            <td>${schoolClass.name}</td>
            <td>${schoolClass.teacher_name || '-'}</td>
            <td>${schoolClass.schedule}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderProfileCard() {
  if (!state.profile) return '';
  return `
    <div class="card">
      <h2>Profil Saya</h2>
      <p><strong>Nama:</strong> ${state.profile.name}</p>
      <p><strong>Email:</strong> ${state.profile.email}</p>
      <p><strong>Peran:</strong> ${state.profile.role}</p>
      ${state.profile.grade_level ? `<p><strong>Kelas:</strong> ${state.profile.grade_level}</p>` : ''}
      ${state.profile.homeroom ? `<p><strong>Rombel:</strong> ${state.profile.homeroom}</p>` : ''}
      ${state.profile.subject ? `<p><strong>Mata Pelajaran:</strong> ${state.profile.subject}</p>` : ''}
    </div>
  `;
}

function renderAdminSection() {
  if (state.user.role !== 'admin') return '';
  return `
    <div class="card">
      <h2>Manajemen Data</h2>
      <div class="grid grid-2">
        <div>
          <h3>Tambah Siswa</h3>
          <form id="student-form">
            <div class="form-group"><label>Nama</label><input name="name" required /></div>
            <div class="form-group"><label>Email</label><input name="email" type="email" required /></div>
            <div class="form-group"><label>Kelas</label><input name="grade_level" required /></div>
            <div class="form-group"><label>Rombel</label><input name="homeroom" required /></div>
            <div class="form-group"><label>Kata Sandi</label><input name="password" type="password" required /></div>
            <button type="submit">Simpan Siswa</button>
          </form>
        </div>
        <div>
          <h3>Tambah Guru</h3>
          <form id="teacher-form">
            <div class="form-group"><label>Nama</label><input name="name" required /></div>
            <div class="form-group"><label>Email</label><input name="email" type="email" required /></div>
            <div class="form-group"><label>Mata Pelajaran</label><input name="subject" required /></div>
            <div class="form-group"><label>Kata Sandi</label><input name="password" type="password" required /></div>
            <button type="submit">Simpan Guru</button>
          </form>
          <h3 style="margin-top:24px;">Tambah Kelas</h3>
          <form id="class-form">
            <div class="form-group"><label>Nama Kelas</label><input name="name" required /></div>
            <div class="form-group"><label>ID Guru</label><input name="teacher_id" type="number" required /></div>
            <div class="form-group"><label>Jadwal</label><input name="schedule" required /></div>
            <button type="submit">Simpan Kelas</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

function renderTeacherSection() {
  if (state.user.role !== 'teacher') return '';
  return `
    <div class="card">
      <h2>Pengumuman & Kelas</h2>
      <form id="announcement-form">
        <div class="form-group"><label>Judul</label><input name="title" required /></div>
        <div class="form-group"><label>Isi Pengumuman</label><textarea name="content" rows="4" required></textarea></div>
        <div class="form-group"><label>Audiens</label>
          <select name="audience" required>
            <option value="all">Semua</option>
            <option value="teacher">Guru</option>
            <option value="student">Siswa</option>
          </select>
        </div>
        <button type="submit">Kirim Pengumuman</button>
      </form>
    </div>
  `;
}

function renderCommonReports() {
  return `
    <div class="card">
      <h2>Data Sekolah</h2>
      <div class="grid grid-2">
        <div>
          <h3>Daftar Siswa</h3>
          ${renderStudentTable()}
        </div>
        <div>
          <h3>Daftar Kelas</h3>
          ${renderClassTable()}
        </div>
      </div>
    </div>
  `;
}

async function restoreSession() {
  try {
    const { user } = await api('session');
    setState({ user });
    await Promise.all([fetchProfile(), fetchDashboard(), fetchLists()]);
  } catch (_) {
    setState({ user: null, profile: null, dashboard: null, students: [], teachers: [], classes: [], announcements: [] });
  }
}

function render() {
  app.innerHTML = `
    ${state.error ? `<div class="alert error">${state.error}</div>` : ''}
    ${state.info ? `<div class="alert success">${state.info}</div>` : ''}
    ${state.user ? `
      ${renderTopbar()}
      ${renderOverviewCards()}
      ${renderProfileCard()}
      ${renderAnnouncements()}
      ${renderAdminSection()}
      ${renderTeacherSection()}
      ${renderCommonReports()}
    ` : renderLogin()}
  `;

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  const studentForm = document.getElementById('student-form');
  if (studentForm) studentForm.addEventListener('submit', handleCreateStudent);
  const teacherForm = document.getElementById('teacher-form');
  if (teacherForm) teacherForm.addEventListener('submit', handleCreateTeacher);
  const classForm = document.getElementById('class-form');
  if (classForm) classForm.addEventListener('submit', handleCreateClass);
  const announcementForm = document.getElementById('announcement-form');
  if (announcementForm) announcementForm.addEventListener('submit', handleCreateAnnouncement);
}

window.handleLogout = handleLogout;

render();
restoreSession();
