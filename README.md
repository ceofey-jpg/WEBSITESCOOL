# WEBSITESCOOL

Portal SMA Negeri dengan stack modern:
- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js + Express
- Database: MySQL / MariaDB
- Autentikasi: JWT + role-based access control
- Deployment-ready: Docker + docker-compose

## Cara menjalankan lokal
1. Salin `.env.example` menjadi `.env`.
2. Sesuaikan kredensial MySQL pada `.env`.
3. Jalankan `npm install`.
4. Jalankan aplikasi dengan:
   - `npm start`
   - atau `npm run dev` untuk hot reload

## Docker
Jalankan seluruh stack dengan:

```bash
docker compose up --build
```

Aplikasi akan tersedia di `http://localhost:4000`.

## Kredensial awal
- Email: `admin@smanegeri.sch.id`
- Password: `Admin123!`

## Struktur folder
- `server.js` — entrypoint backend Express
- `db.js` — koneksi MySQL dan model data
- `public/` — frontend HTML/CSS/JS
- `Dockerfile` — container aplikasi
- `docker-compose.yml` — stack aplikasi + MySQL
- `.env.example` — konfigurasi environment
