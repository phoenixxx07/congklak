# 🪵 Game Congklak Nusantara 1 vs 1 (Multiplayer Online & Mabar Jarak Jauh)

Permainan tradisional Congklak 1 vs 1 interaktif berbasis web dengan desain papan kayu 3D elegan, animasi putaran searah jarum jam (*clockwise*), efek suara kerang Web Audio API, **Multi-Ronde Ngacang**, dan **Sistem Sudut Pandang (POV) Dinamis**.

---

## 👁️ Sistem Sudut Pandang (POV) Baru

Sesuai permintaan Anda:
- **Mode Main di Tempat (1 Layar):**
  - Tampilan **tetap Atas (Player 2) dan Bawah (Player 1)** agar nyaman dimainkan bersama di satu meja / satu layar.
- **Mode Online / Undangan (Mabar Beda HP / Beda Komputer):**
  - **Semua pemain melihat baris miliknya selalu di BAWAH!**
  - Player 1 melihat barisnya di Bawah, lawan di Atas.
  - Player 2 melihat barisnya di Bawah, lawan di Atas.
  - Papan otomatis berotasi 180° secara mulus di layar Player 2 sehingga kedua pemain merasakan pengalaman bermain langsung dari sisi mereka sendiri.

---

## 🌐 Cara Mabar Meskipun Tidak di Tempat yang Sama (Beda Lokasi)

Ada 2 cara mudah agar teman bisa ikut bermain:

### Cara 1: Teman di Satu Wi-Fi / Hotspot yang Sama
Jika Anda dan teman terhubung ke Wi-Fi atau Hotspot HP yang sama:
1. Teman cukup membuka alamat IP laptop Anda di browser HP/laptop mereka:
   👉 **`http://192.168.47.211:9090`**
2. Teman membuat nama & ID, lalu Anda atau teman saling undang lewat ID!

---

### Cara 2: Teman Berada di Beda Tempat / Beda Rumah / Beda Kota (Internet Luar)
Jika teman berada di luar rumah atau jaringan berbeda, gunakan tunnel publik gratis (tanpa perlu install aplikasi berat):

1. Di terminal komputer host, jalankan perintah berikut:
   ```bash
   npx localtunnel --port 9090
   ```
   *(Atau bisa menggunakan ngrok: `npx ngrok http 9090`)*

2. Terminal akan memberikan link publik HTTPS instan, contoh:
   👉 `https://congklak-nusantara.loca.lt`

3. Kirimkan link tersebut beserta Player ID Anda ke teman lewat WhatsApp / Telegram!
4. Teman buka link tersebut di HP mereka, masukkan ID Anda, dan pertandingan langsung dimulai!

---

## 🔗 Tautan Mabar Instan (Share Link)
Di dalam modal **👥 Lobi Online**, terdapat tombol **"🔗 Salin Tautan Mabar"**.
Tautan tersebut otomatis menyertakan ID Anda (misal `http://192.168.47.211:9090/?invite=BUDI-88`). Ketika teman membuka tautan itu, lobi langsung terbuka dan otomatis mengundang Anda tanpa perlu mengetik ulang ID!

---

## 🎮 Pilihan Mode Bermain
Klik tombol **🎮 Mode** di bagian atas untuk memilih:
1. **📱 Main di Tempat:** 1 perangkat untuk 2 pemain (View Atas - Bawah tetap).
2. **🌐 Mabar Online:** Mabar jarak jauh dengan Player ID (Semua view di bawah).
3. **🤖 vs Komputer (AI):** Latihan melawan bot cerdas.

---

## 📱 Dukungan Tampilan Mobile (Disarankan Landscape)
* Papan Congklak memiliki 16 lubang horizontal, sehingga tampilan terbaik dan paling nyaman diakses adalah posisi **Landscape (Mendatar)**.
* **Deteksi Otomatis & Overlay Rekomendasi:** Saat dibuka di HP dalam mode potret (tegak), sistem otomatis memunculkan pop-up & banner rekomendasi:
  * Tombol **🔄 Putar Layar Sekarang** (mengaktifkan layar penuh dan mengunci orientasi ke landscape pada perangkat yang mendukung).
  * Tombol **✕ Tetap di Portrait** jika pemain memilih tetap di mode potret (papan dapat digeser horizontal dengan mulus).
* **Auto-Dismiss:** Begitu layar HP diputar mendatar (landscape), overlay otomatis hilang dan tata letak papan menyesuaikan tinggi layar secara presisi.
