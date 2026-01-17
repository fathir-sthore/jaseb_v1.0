# 🤖 JASSEB Telegram Bot (Netlify Version)

Bot Telegram untuk broadcast pesan ke semua grup dengan deploy otomatis di Netlify.

## 🌟 Fitur Utama

- 📢 **Broadcast Massal**: Kirim pesan ke semua grup sekaligus
- 👑 **Sistem Premium Otomatis**: Dapatkan premium dengan menambah bot ke 2 grup
- 🔄 **Auto Share**: Jadwalkan pengiriman pesan otomatis
- 📊 **Analytics Lengkap**: Pantau statistik real-time
- 🔒 **Backup Otomatis**: Data aman dengan backup berkala
- 🌐 **Netlify Hosting**: Uptime 99.9% dan performa maksimal

## 🚀 Cara Deploy ke Netlify

### Langkah 1: Fork Repository
1. Klik tombol "Fork" di kanan atas
2. Pilih akun GitHub Anda

### Langkah 2: Siapkan Environment Variables
1. Buka [BotFather](https://t.me/BotFather) di Telegram
2. Buat bot baru atau gunakan bot yang sudah ada
3. Dapatkan token bot
4. Di Netlify, tambahkan environment variable:
   - `BOT_TOKEN`: Token bot Anda

### Langkah 3: Deploy ke Netlify

**Cara 1: Deploy via Netlify Website**
1. Buka [netlify.com](https://netlify.com)
2. Klik "New site from Git"
3. Pilih GitHub > pilih repository Anda
4. Klik "Deploy site"

**Cara 2: Deploy via Netlify CLI**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login ke Netlify
netlify login

# Clone repository
git clone https://github.com/username/bot-jasseb-netlify.git
cd bot-jasseb-netlify

# Deploy
netlify init
netlify deploy --prod
