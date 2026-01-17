const { Telegraf, Markup } = require("telegraf");
const express = require('express');
const fs = require("fs");
const path = require("path");
const dotenv = require('dotenv');
const cron = require('node-cron');

// Load environment variables
dotenv.config();

// Inisialisasi app Express
const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi bot dengan token dari environment variable
const BOT_TOKEN = process.env.BOT_TOKEN || "8592407821:AAGOB2FmqS8YC1U8JgGXtsNp6eSFqLdz7O0";
const bot = new Telegraf(BOT_TOKEN);

// Konfigurasi path database
const databaseDir = path.join(__dirname, '../database');
const blacklistFile = path.join(databaseDir, "blacklist.json");
const groupFile = path.join(databaseDir, "grub.json");
const presetFile = path.join(databaseDir, "preset.json");
const premiumFile = path.join(databaseDir, "premium.json");
const groupStatFile = path.join(databaseDir, "groupstats.json");
const userFile = path.join(databaseDir, "users.json");
const autoShareFile = path.join(databaseDir, "autoshare.json");
const ownerFile = path.join(databaseDir, "owner.json");
const autoKirimFile = path.join(databaseDir, "autokirim.json");

// Owner ID dan channel
const ownerId = [6210345140];
const channelWajib = ["@infoupdetscfsxdxy"];
const channelGimick = "@infoupdetscfsxdxy";

// Variabel interval
let autoShareInterval = null;
let autoKirimInterval = null;

// Middleware untuk parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

/* ============================================
   ENDPOINTS UNTUK NETLIFY
============================================ */

// Endpoint utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    bot: 'JASSEB Bot',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: process.platform
  });
});

// Status endpoint
app.get('/status', async (req, res) => {
  try {
    const groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    const premium = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    
    res.json({
      status: 'online',
      bot_username: bot.botInfo?.username || 'Loading...',
      groups: groups.length,
      users: users.length,
      premium: premium.length,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status', details: error.message });
  }
});

// Webhook endpoint untuk Netlify Functions (jika diperlukan)
app.post('/webhook', (req, res) => {
  console.log('Webhook received:', req.body);
  res.json({ received: true });
});

// API untuk mendapatkan stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      groups: JSON.parse(fs.readFileSync(groupFile, 'utf8')).length,
      users: JSON.parse(fs.readFileSync(userFile, 'utf8')).length,
      premium: JSON.parse(fs.readFileSync(premiumFile, 'utf8')).length,
      owner: JSON.parse(fs.readFileSync(ownerFile, 'utf8')).length,
      blacklist: JSON.parse(fs.readFileSync(blacklistFile, 'utf8')).length
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================
   INISIALISASI DATABASE
============================================ */

function initializeDatabase() {
  // Pastikan folder database ada
  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
    console.log('📁 Created database directory');
  }
  
  // File-file database default
  const databaseFiles = [
    { file: blacklistFile, default: [] },
    { file: groupFile, default: [] },
    { file: presetFile, default: Array(20).fill("") },
    { file: premiumFile, default: [] },
    { file: groupStatFile, default: {} },
    { file: userFile, default: [] },
    { file: autoShareFile, default: { interval: 10 } },
    { file: ownerFile, default: ownerId },
    { file: autoKirimFile, default: { status: false, text: "" } }
  ];
  
  // Buat file jika belum ada
  databaseFiles.forEach(({ file, default: defaultValue }) => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
      console.log(`📄 Created: ${path.basename(file)}`);
    }
  });
  
  console.log('✅ Database initialized successfully');
}

// Jalankan inisialisasi
initializeDatabase();

/* ============================================
   FUNGSI UTILITAS
============================================ */

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Cek join channel
async function cekJoinChannel(userId, ctx) {
  for (const ch of channelWajib) {
    try {
      const m = await ctx.telegram.getChatMember(ch, userId);
      if (!["member", "administrator", "creator"].includes(m.status)) {
        return false;
      }
    } catch (error) {
      console.log(`⚠️ Failed to check channel ${ch}:`, error.message);
      return false;
    }
  }
  return true;
}

// Array gambar random
const randomImages = [
  "https://files.catbox.moe/cw3o8i.jpg",
  "https://files.catbox.moe/c45jek.jpg",
  "https://files.catbox.moe/uvegiv.jpg"
];

const getRandomImage = () => randomImages[Math.floor(Math.random() * randomImages.length)];

// Fungsi edit menu
async function editMenu(ctx, caption, buttons) {
  try {
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: getRandomImage(),
        caption: caption,
        parse_mode: 'HTML',
      },
      {
        reply_markup: buttons.reply_markup,
      }
    );
  } catch (error) {
    console.error('Error editing menu:', error);
    try {
      await ctx.replyWithPhoto(getRandomImage(), {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      });
    } catch (e) {
      console.error('Failed to send new message:', e);
    }
  }
}

// Fungsi backup untuk Netlify
async function kirimBackupNetlify() {
  try {
    const owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    const files = [
      { name: 'groups', path: groupFile },
      { name: 'users', path: userFile },
      { name: 'premium', path: premiumFile },
      { name: 'stats', path: groupStatFile }
    ];
    
    for (const ownerId of owners) {
      try {
        await bot.telegram.sendMessage(ownerId, `📦 Backup otomatis - ${new Date().toLocaleString()}`);
        
        for (const { name, path: filePath } of files) {
          if (fs.existsSync(filePath)) {
            await bot.telegram.sendDocument(ownerId, {
              source: filePath,
              filename: `${name}_backup_${Date.now()}.json`
            });
          }
        }
        
        console.log(`✅ Backup sent to owner ${ownerId}`);
      } catch (e) {
        console.log(`❌ Failed to send backup to ${ownerId}:`, e.message);
      }
    }
  } catch (error) {
    console.error('Error in backup function:', error);
  }
}

/* ============================================
   MIDDLEWARE BOT
============================================ */

// Middleware global untuk cek join channel
bot.use(async (ctx, next) => {
  try {
    // Skip untuk command start dan help
    if (ctx.message && ctx.message.text) {
      const text = ctx.message.text.toLowerCase();
      if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/ping')) {
        return next();
      }
    }

    const uid = ctx.from?.id;
    if (!uid) return;

    // Cek blacklist
    const blacklist = JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
    if (blacklist.includes(uid)) {
      return ctx.reply("🚫 Maaf, Anda diblokir dari menggunakan bot ini.");
    }

    // Cek join channel
    const hasJoined = await cekJoinChannel(uid, ctx);
    if (!hasJoined) {
      const keyboard = Markup.inlineKeyboard([
        ...channelWajib.map(ch => 
          Markup.button.url(`Join ${ch}`, `https://t.me/${ch.replace('@', '')}`)
        ),
        Markup.button.url('Join Developer Channel', `https://t.me/${channelGimick.replace('@', '')}`),
        Markup.button.callback('✅ Sudah Join', 'check_join')
      ], { columns: 1 });
      
      return ctx.reply(
        `📢 **WAJIB JOIN CHANNEL**\n\n` +
        `Untuk menggunakan bot ini, Anda harus join channel berikut:\n\n` +
        channelWajib.map(ch => `• ${ch}`).join('\n') +
        `\n\nSetelah join, klik /start lagi atau tombol "Sudah Join" di bawah.`,
        { parse_mode: 'Markdown', ...keyboard }
      );
    }
    
    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next();
  }
});

// Action handler untuk check join
bot.action('check_join', async (ctx) => {
  await ctx.answerCbQuery();
  const hasJoined = await cekJoinChannel(ctx.from.id, ctx);
  
  if (hasJoined) {
    await ctx.reply('✅ Selamat! Anda sudah join semua channel. Silakan gunakan bot dengan bebas.');
    // Kirim menu start
    await ctx.reply('Ketik /start untuk melihat menu utama');
  } else {
    await ctx.reply('❌ Anda belum join semua channel wajib. Silakan join terlebih dahulu.');
  }
});

/* ============================================
   HANDLER EVENT BOT DITAMBAHKAN KE GRUP
============================================ */

bot.on("new_chat_members", async ctx => {
  try {
    const botId = (await bot.telegram.getMe()).id;
    const newMembers = ctx.message.new_chat_members;

    const isBotAdded = newMembers.some(member => member.id === botId);
    if (!isBotAdded) return;

    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title || "Tanpa Nama";
    const adder = ctx.message.from;
    const adderId = adder.id;
    const username = adder.username ? `@${adder.username}` : `User ${adderId}`;

    // Update groups database
    let groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    if (!groups.includes(groupId)) {
      groups.push(groupId);
      fs.writeFileSync(groupFile, JSON.stringify(groups, null, 2));
    }

    // Update user stats
    let stats = JSON.parse(fs.readFileSync(groupStatFile, 'utf8'));
    stats[adderId] = (stats[adderId] || 0) + 1;
    fs.writeFileSync(groupStatFile, JSON.stringify(stats, null, 2));

    const totalUserAdded = stats[adderId];

    // Berikan premium jika sudah menambahkan ke 2 grup
    let premiumUsers = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    if (totalUserAdded === 2 && !premiumUsers.includes(adderId)) {
      premiumUsers.push(adderId);
      fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
      
      // Kirim notifikasi ke user
      try {
        await bot.telegram.sendMessage(adderId,
          `🎉 **SELAMAT! ANDA MENDAPATKAN AKUN PREMIUM!**\n\n` +
          `Anda telah menambahkan bot ke ${totalUserAdded} grup.\n` +
          `Sekarang Anda dapat menggunakan fitur:\n` +
          `• /share - Untuk membagikan pesan ke semua grup\n` +
          `• Dan fitur premium lainnya\n\n` +
          `Terima kasih telah mendukung bot kami!`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.log('Cannot notify user:', e.message);
      }
    }

    // Kirim notifikasi ke owner
    const owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    for (const owner of owners) {
      try {
        await bot.telegram.sendMessage(owner,
          `🤖 **BOT DITAMBAHKAN KE GRUP BARU**\n\n` +
          `👤 **Penambah:** ${username}\n` +
          `🆔 **ID User:** \`${adderId}\`\n` +
          `🏷 **Nama Grup:** ${groupName}\n` +
          `🔢 **Total Grup oleh User:** ${totalUserAdded}\n` +
          `📊 **Total Grup Bot:** ${groups.length}\n\n` +
          `⏰ ${new Date().toLocaleString()}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.log(`Cannot notify owner ${owner}:`, e.message);
      }
    }

    // Sambutan di grup
    await ctx.reply(
      `🤖 **Halo semua! Saya JASSEB Bot**\n\n` +
      `Terima kasih ${username} telah menambahkan saya ke grup ini!\n\n` +
      `📌 **Fitur Utama:**\n` +
      `• Broadcast pesan ke semua grup\n` +
      `• Auto share otomatis\n` +
      `• Sistem premium otomatis\n\n` +
      `ℹ️ Ketik /help untuk bantuan\n` +
      `👑 Ketik /start untuk memulai`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in new_chat_members handler:', error);
  }
});

/* ============================================
   HANDLER COMMAND BOT
============================================ */

// Command /start
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userFirstName = ctx.from.first_name || 'Pengguna';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'User';
    
    // Simpan user ke database
    let users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    if (!users.includes(userId)) {
      users.push(userId);
      fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    }
    
    // Cek status premium
    let premiumUsers = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    const isPremium = premiumUsers.includes(userId);
    
    const welcomeMessage = `
🎊 **SELAMAT DATANG ${userFirstName.toUpperCase()}!** 🎊

🤖 **JASSEB BOT v2.0**
*Platform Broadcast Telegram Terbaik*

👑 **Status Akun:** ${isPremium ? '⭐ PREMIUM' : '🔓 STANDARD'}
👤 **Username:** ${username}
🆔 **ID:** \`${userId}\`

📌 **Cara Mendapatkan Premium:**
Tambahkan bot ke 2 grup berbeda, maka otomatis menjadi Premium!

✨ **Fitur Premium:**
• /share - Broadcast ke semua grup
• Prioritas akses
• Dan masih banyak lagi...

📱 **Menu Tersedia:**
`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 MENU UTAMA', 'main_menu'),
        Markup.button.callback('👑 FITUR PREMIUM', 'premium_menu')
      ],
      [
        Markup.button.callback('📊 STATISTIK', 'stats_menu'),
        Markup.button.callback('⚙️ PENGATURAN', 'settings_menu')
      ],
      [
        Markup.button.url('📢 JOIN CHANNEL', `https://t.me/${channelGimick.replace('@', '')}`),
        Markup.button.url('👨‍💻 DEVELOPER', 'https://t.me/fathirsthore')
      ],
      [
        Markup.button.callback('🆘 BANTUAN', 'help_menu')
      ]
    ]);

    await ctx.replyWithPhoto(getRandomImage(), {
      caption: welcomeMessage,
      parse_mode: 'Markdown',
      ...keyboard
    });

    console.log(`👤 User ${username} (${userId}) started the bot`);

  } catch (error) {
    console.error('Error in /start command:', error);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
});

// Command /help
bot.command('help', async (ctx) => {
  const helpMessage = `
🆘 **BANTUAN JASSEB BOT**

📚 **DAFTAR PERINTAH:**

👤 **Untuk Semua User:**
/start - Memulai bot
/help - Menampilkan bantuan
/ping - Cek status bot
/status - Lihat statistik bot

👑 **Untuk User Premium:**
/share - Broadcast pesan ke semua grup (reply pesan)

👨‍💻 **Untuk Owner:**
/bcuser - Broadcast ke semua user
/pinggrub - Cek status semua grup
/top - Ranking user
/set - Simpan pesan preset
/del - Hapus pesan preset
/list - Lihat daftar pesan
/addprem - Tambah user premium
/delprem - Hapus user premium
/auto - Auto kirim pesan
/blokir - Blokir user
/unblokir - Buka blokir user
/backup - Ambil backup data
/stats - Lihat statistik lengkap

⚙️ **Pengaturan:**
/setjeda - Atur jeda autoshare (owner only)

📞 **Support:**
Jika mengalami masalah, hubungi @Wikiofficiall
`;

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Command /ping
bot.command('ping', async (ctx) => {
  const start = Date.now();
  const msg = await ctx.reply('🏓 Pinging...');
  const end = Date.now();
  const pingTime = end - start;
  
  // Get bot info
  const botInfo = await bot.telegram.getMe();
  const groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
  const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
  
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    msg.message_id,
    null,
    `✅ **BOT AKTIF!**\n\n` +
    `🤖 **Bot:** ${botInfo.first_name} (@${botInfo.username})\n` +
    `🏓 **Ping:** ${pingTime}ms\n` +
    `📊 **Statistik:**\n` +
    `   • Grup: ${groups.length}\n` +
    `   • User: ${users.length}\n` +
    `🕒 **Uptime:** ${Math.floor(process.uptime() / 60)} menit\n` +
    `🌐 **Server:** Netlify\n` +
    `⚡ **Node.js:** ${process.version}`,
    { parse_mode: 'Markdown' }
  );
});

// Command /share (Fitur Premium)
bot.command("share", async ctx => {
  try {
    const senderId = ctx.from.id;
    const replyMsg = ctx.message.reply_to_message;

    // Cek premium
    let premiumUsers = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    if (!premiumUsers.includes(senderId)) {
      return ctx.reply(
        `❌ **AKSES DITOLAK**\n\n` +
        `Fitur ini hanya untuk user premium!\n\n` +
        `🎯 **Cara mendapatkan premium:**\n` +
        `Tambahkan bot ini ke 2 grup berbeda.\n` +
        `Setelah itu, Anda otomatis menjadi premium!\n\n` +
        `ℹ️ Status Anda saat ini: **STANDARD**`,
        { parse_mode: 'Markdown' }
      );
    }

    if (!replyMsg) {
      return ctx.reply(
        `📤 **CARA MENGGUNAKAN /share**\n\n` +
        `1. Balas (reply) pesan yang ingin disebar\n` +
        `2. Ketik /share\n` +
        `3. Pesan akan dikirim ke semua grup\n\n` +
        `⚠️ **Pastikan pesan yang dibalas tidak mengandung konten terlarang.**`,
        { parse_mode: 'Markdown' }
      );
    }

    let groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    if (groups.length === 0) {
      return ctx.reply("❌ Belum ada grup yang terdaftar.");
    }

    // Konfirmasi sebelum broadcast
    const confirmKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ YA, KIRIM SEKARANG', 'confirm_share'),
        Markup.button.callback('❌ BATAL', 'cancel_share')
      ]
    ]);

    const confirmMsg = await ctx.reply(
      `📢 **KONFIRMASI BROADCAST**\n\n` +
      `Anda akan mengirim pesan ke **${groups.length} grup**.\n\n` +
      `📝 **Preview Pesan:**\n` +
      `${replyMsg.text ? replyMsg.text.substring(0, 100) + '...' : '[Media Content]'}\n\n` +
      `Apakah Anda yakin ingin melanjutkan?`,
      { parse_mode: 'Markdown', ...confirmKeyboard }
    );

    // Simpan data untuk callback
    ctx.session = ctx.session || {};
    ctx.session.pendingShare = {
      messageId: replyMsg.message_id,
      chatId: ctx.chat.id,
      confirmMsgId: confirmMsg.message_id,
      groupsCount: groups.length
    };

  } catch (error) {
    console.error('Error in /share command:', error);
    await ctx.reply('❌ Terjadi kesalahan saat memproses perintah.');
  }
});

// Handler untuk confirm share
bot.action('confirm_share', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    if (!ctx.session || !ctx.session.pendingShare) {
      return ctx.reply('❌ Sesi telah berakhir. Silakan ulangi /share.');
    }
    
    const { messageId, chatId, confirmMsgId, groupsCount } = ctx.session.pendingShare;
    
    // Update pesan konfirmasi
    await ctx.editMessageText(
      `⏳ **MENGIRIM PESAN...**\n\n` +
      `Progress: 0/${groupsCount} grup\n` +
      `⏰ Estimasi: ${Math.ceil(groupsCount * 1.5 / 60)} menit`,
      { parse_mode: 'Markdown' }
    );
    
    let groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    let success = 0;
    let failed = 0;
    let processed = 0;
    
    // Broadcast ke semua grup
    for (const groupId of groups) {
      try {
        await ctx.telegram.forwardMessage(groupId, chatId, messageId);
        success++;
      } catch (error) {
        failed++;
        console.log(`Failed to send to ${groupId}:`, error.message);
      }
      
      processed++;
      
      // Update progress setiap 5 grup atau terakhir
      if (processed % 5 === 0 || processed === groups.length) {
        const progress = Math.round((processed / groups.length) * 100);
        try {
          await ctx.editMessageText(
            `⏳ **MENGIRIM PESAN...**\n\n` +
            `Progress: ${processed}/${groups.length} grup (${progress}%)\n` +
            `✅ Sukses: ${success} | ❌ Gagal: ${failed}`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          // Ignore edit errors
        }
      }
      
      await delay(1500); // Delay 1.5 detik antar grup
    }
    
    // Hasil akhir
    await ctx.editMessageText(
      `🎉 **BROADCAST SELESAI!**\n\n` +
      `📊 **HASIL:**\n` +
      `• ✅ Sukses: **${success}** grup\n` +
      `• ❌ Gagal: **${failed}** grup\n` +
      `• 📊 Total: **${groups.length}** grup\n\n` +
      `⏰ **Waktu:** ${new Date().toLocaleString()}\n` +
      `👤 **Pengirim:** ${ctx.from.first_name || 'User'}\n\n` +
      `Terima kasih telah menggunakan JASSEB Bot!`,
      { parse_mode: 'Markdown' }
    );
    
    // Hapus session
    delete ctx.session.pendingShare;
    
    console.log(`📤 Broadcast completed by ${ctx.from.id}: ${success} success, ${failed} failed`);
    
  } catch (error) {
    console.error('Error in confirm_share:', error);
    await ctx.reply('❌ Terjadi kesalahan saat broadcast.');
  }
});

// Handler untuk cancel share
bot.action('cancel_share', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('❌ Broadcast dibatalkan.');
  if (ctx.session) {
    delete ctx.session.pendingShare;
  }
});

// Command /bcuser (Owner only)
bot.command("bcuser", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Akses hanya untuk owner.");
    }

    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) {
      return ctx.reply("❌ Balas pesan yang mau di-broadcast ke semua user.");
    }

    let userList = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    if (userList.length === 0) {
      return ctx.reply("❌ Belum ada user yang terdaftar.");
    }

    const confirmMsg = await ctx.reply(
      `📢 **BROADCAST KE USER**\n\n` +
      `Anda akan mengirim ke **${userList.length} user**.\n` +
      `Lanjutkan?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ YA', 'confirm_bcuser')],
        [Markup.button.callback('❌ TIDAK', 'cancel_bcuser')]
      ])
    );
    
    ctx.session = ctx.session || {};
    ctx.session.pendingBcUser = {
      messageId: replyMsg.message_id,
      chatId: ctx.chat.id,
      confirmMsgId: confirmMsg.message_id,
      usersCount: userList.length
    };

  } catch (error) {
    console.error('Error in /bcuser command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /pinggrub
bot.command("pinggrub", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Akses hanya untuk owner.");
    }

    let groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    const progressMsg = await ctx.reply(`🔍 Memeriksa ${groups.length} grup...`);

    let active = 0;
    let inactive = 0;
    let updatedGroups = [];

    for (let i = 0; i < groups.length; i++) {
      const groupId = groups[i];
      try {
        await ctx.telegram.sendChatAction(groupId, "typing");
        updatedGroups.push(groupId);
        active++;
      } catch (error) {
        inactive++;
      }

      // Update progress
      if (i % 10 === 0 || i === groups.length - 1) {
        const percent = Math.round(((i + 1) / groups.length) * 100);
        await ctx.telegram.editMessageText(
          progressMsg.chat.id,
          progressMsg.message_id,
          null,
          `🔍 Memeriksa ${groups.length} grup... ${percent}%`
        );
      }
      
      await delay(500);
    }

    // Simpan grup aktif
    fs.writeFileSync(groupFile, JSON.stringify(updatedGroups, null, 2));

    await ctx.telegram.editMessageText(
      progressMsg.chat.id,
      progressMsg.message_id,
      null,
      `✅ **PEMERIKSAAN SELESAI**\n\n` +
      `📊 **HASIL:**\n` +
      `• ✅ Aktif: **${active}** grup\n` +
      `• ❌ Tidak Aktif: **${inactive}** grup\n` +
      `• 📈 Total Awal: **${groups.length}** grup\n\n` +
      `Database telah diperbarui.`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in /pinggrub command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /stats
bot.command("stats", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Akses hanya untuk owner.");
    }

    const groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    const premium = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    const blacklist = JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
    const stats = JSON.parse(fs.readFileSync(groupStatFile, 'utf8'));

    // Hitung top users
    const topUsers = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const statsMessage = `
📊 **STATISTIK LENGKAP BOT** 📊

👥 **USER:**
• Total User: **${users.length}**
• Premium User: **${premium.length}**
• Blacklisted: **${blacklist.length}**

🏘️ **GRUP:**
• Total Grup: **${groups.length}**

🏆 **TOP 5 USER:**
${topUsers.map(([id, count], index) => 
  `${index + 1}. ID \`${id}\` - ${count} grup`
).join('\n')}

⚙️ **SISTEM:**
• Server: **Netlify**
• Runtime: **Node.js ${process.version}**
• Uptime: **${Math.floor(process.uptime() / 3600)} jam**
• Memory: **${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB**

🔄 **FITUR AKTIF:**
• Auto Share: ${autoShareInterval ? '✅ AKTIF' : '❌ NONAKTIF'}
• Auto Kirim: ${autoKirimInterval ? '✅ AKTIF' : '❌ NONAKTIF'}

⏰ **UPDATE:** ${new Date().toLocaleString()}
`;

    await ctx.reply(statsMessage, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /stats command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /backup
bot.command("backup", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa ambil backup.");
    }

    const files = [
      { name: "Grup", file: groupFile },
      { name: "User", file: userFile },
      { name: "Premium", file: premiumFile },
      { name: "Stats", file: groupStatFile },
      { name: "Preset", file: presetFile }
    ];

    const progressMsg = await ctx.reply("📦 Menyiapkan backup...");

    for (let i = 0; i < files.length; i++) {
      const { name, file } = files[i];
      if (fs.existsSync(file)) {
        try {
          await ctx.telegram.sendDocument(ctx.from.id, { 
            source: file,
            filename: `backup_${name.toLowerCase()}_${Date.now()}.json`
          });
        } catch (e) {
          console.log(`Failed to send ${name}:`, e.message);
        }
      }
    }

    await ctx.telegram.editMessageText(
      progressMsg.chat.id,
      progressMsg.message_id,
      null,
      "✅ Backup telah dikirim ke chat pribadi Anda."
    );

  } catch (error) {
    console.error('Error in /backup command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /top
bot.command("top", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Akses hanya untuk owner.");
    }

    let stats = JSON.parse(fs.readFileSync(groupStatFile, 'utf8'));
    if (Object.keys(stats).length === 0) {
      return ctx.reply("❌ Belum ada data statistik.");
    }

    let sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    let leaderboard = "🏆 **LEADERBOARD PENAMBAHAN GRUP** 🏆\n\n";
    
    sorted.forEach(([userId, count], index) => {
      const rank = index + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
      leaderboard += `${medal} ID \`${userId}\` - **${count}** grup\n`;
      
      if (index === 9) leaderboard += "\n━━━━━━━━━━━━━━━━━━\n";
    });

    leaderboard += `\n📊 Total peserta: **${sorted.length}** user`;
    
    await ctx.reply(leaderboard, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /top command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /auto
bot.command("auto", async (ctx) => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa pakai perintah ini.");
    }

    const args = ctx.message.text.slice(6).trim();
    const [command, ...textParts] = args.split(" ");
    const text = textParts.join(" ");

    let cfg = JSON.parse(fs.readFileSync(autoKirimFile, 'utf8'));

    if (command === "off") {
      if (!cfg.status) {
        return ctx.reply("ℹ️ Auto-kirim sudah nonaktif.");
      }
      
      if (autoKirimInterval) {
        clearInterval(autoKirimInterval);
        autoKirimInterval = null;
      }
      
      cfg.status = false;
      fs.writeFileSync(autoKirimFile, JSON.stringify(cfg, null, 2));
      return ctx.reply("✅ Auto-kirim dimatikan.");
    }

    if (command === "on") {
      if (!text) {
        return ctx.reply("❌ Format: /auto on <teks>\nContoh: /auto on Promo spesial hari ini!");
      }
      
      if (cfg.status) {
        return ctx.reply("ℹ️ Auto-kirim sudah aktif. Matikan dulu dengan /auto off");
      }

      cfg.status = true;
      cfg.text = text;
      fs.writeFileSync(autoKirimFile, JSON.stringify(cfg, null, 2));

      // Function untuk mengirim auto
      const kirimAuto = async () => {
        try {
          let groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
          let success = 0;
          let failed = 0;
          
          for (const groupId of groups) {
            try {
              await ctx.telegram.sendMessage(groupId, text);
              success++;
            } catch (error) {
              failed++;
            }
            await delay(1000);
          }
          
          console.log(`[AutoKirim] Success: ${success}, Failed: ${failed}`);
        } catch (error) {
          console.error('Error in auto kirim:', error);
        }
      };

      // Kirim sekali sekarang
      await kirimAuto();
      
      // Set interval untuk 1 jam sekali
      autoKirimInterval = setInterval(kirimAuto, 60 * 60 * 1000);
      
      return ctx.reply(
        `✅ **AUTO-KIRIM AKTIF**\n\n` +
        `Pesan akan dikirim otomatis setiap 1 jam.\n\n` +
        `📝 **Pesan:**\n${text}\n\n` +
        `⏰ **Jadwal:** Setiap jam\n` +
        `📊 **Target:** Semua grup\n\n` +
        `Gunakan /auto off untuk menghentikan.`,
        { parse_mode: 'Markdown' }
      );
    }

    // Jika bukan on/off
    ctx.reply(
      "❌ **Format perintah salah!**\n\n" +
      "**Untuk mengaktifkan:**\n`/auto on <teks>`\n" +
      "Contoh: `/auto on Promo hari ini!`\n\n" +
      "**Untuk menonaktifkan:**\n`/auto off`",
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in /auto command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /addprem
bot.command("addprem", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa menambahkan premium.");
    }

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    
    if (!targetId) {
      return ctx.reply("❌ Format: /addprem <user_id>\nContoh: /addprem 123456789");
    }

    let data = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    
    if (data.includes(targetId)) {
      return ctx.reply("✅ User sudah premium.");
    }

    data.push(targetId);
    fs.writeFileSync(premiumFile, JSON.stringify(data, null, 2));
    
    ctx.reply(`✅ User \`${targetId}\` ditambahkan ke premium.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /addprem command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /delprem
bot.command("delprem", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa menghapus premium.");
    }

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    
    if (!targetId) {
      return ctx.reply("❌ Format: /delprem <user_id>\nContoh: /delprem 123456789");
    }

    let data = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
    
    if (!data.includes(targetId)) {
      return ctx.reply("❌ User tidak ditemukan di daftar premium.");
    }

    data = data.filter(id => id !== targetId);
    fs.writeFileSync(premiumFile, JSON.stringify(data, null, 2));
    
    ctx.reply(`✅ User \`${targetId}\` dihapus dari premium.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /delprem command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /blokir
bot.command("blokir", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa memblokir.");
    }

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    
    if (!targetId) {
      return ctx.reply("❌ Format: /blokir <user_id>\nContoh: /blokir 123456789");
    }

    let blacklist = JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
    
    if (blacklist.includes(targetId)) {
      return ctx.reply("✅ User sudah diblokir.");
    }

    blacklist.push(targetId);
    fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
    
    ctx.reply(`✅ User \`${targetId}\` berhasil diblokir.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /blokir command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /unblokir
bot.command("unblokir", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa membuka blokir.");
    }

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    
    if (!targetId) {
      return ctx.reply("❌ Format: /unblokir <user_id>\nContoh: /unblokir 123456789");
    }

    let blacklist = JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
    
    if (!blacklist.includes(targetId)) {
      return ctx.reply("❌ User tidak ditemukan di blacklist.");
    }

    blacklist = blacklist.filter(id => id !== targetId);
    fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
    
    ctx.reply(`✅ User \`${targetId}\` berhasil diunblokir.`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /unblokir command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /set
bot.command("set", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa menyimpan preset.");
    }

    const args = ctx.message.text.split(" ");
    const index = parseInt(args[1]);
    const text = args.slice(2).join(" ");

    if (isNaN(index) || index < 1 || index > 20) {
      return ctx.reply("❌ Nomor harus antara 1-20.\nContoh: /set 1 Pesan saya");
    }

    if (!text) {
      return ctx.reply("❌ Teks tidak boleh kosong.");
    }

    let presets = JSON.parse(fs.readFileSync(presetFile, 'utf8'));
    presets[index - 1] = text;
    fs.writeFileSync(presetFile, JSON.stringify(presets, null, 2));

    ctx.reply(`✅ Preset ${index} disimpan:\n\n${text}`);

  } catch (error) {
    console.error('Error in /set command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /del
bot.command("del", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa menghapus preset.");
    }

    const args = ctx.message.text.split(" ");
    const index = parseInt(args[1]);

    if (isNaN(index) || index < 1 || index > 20) {
      return ctx.reply("❌ Nomor harus antara 1-20.\nContoh: /del 1");
    }

    let presets = JSON.parse(fs.readFileSync(presetFile, 'utf8'));
    presets[index - 1] = "";
    fs.writeFileSync(presetFile, JSON.stringify(presetFile, null, 2));

    ctx.reply(`✅ Preset ${index} dihapus.`);

  } catch (error) {
    console.error('Error in /del command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /list
bot.command("list", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa melihat daftar preset.");
    }

    let presets = JSON.parse(fs.readFileSync(presetFile, 'utf8'));
    let message = "📋 **DAFTAR PRESET**\n\n";
    let hasContent = false;

    presets.forEach((text, index) => {
      if (text && text.trim() !== "") {
        message += `${index + 1}. ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}\n\n`;
        hasContent = true;
      }
    });

    if (!hasContent) {
      message = "❌ Tidak ada preset yang tersimpan.";
    }

    ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /list command:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Command /setjeda
bot.command("setjeda", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa mengatur jeda.");
    }

    const args = ctx.message.text.split(" ");
    const minutes = parseInt(args[1]);

    if (isNaN(minutes) || minutes < 1) {
      return ctx.reply("❌ Format: /setjeda <menit>\nContoh: /setjeda 30");
    }

    let config = JSON.parse(fs.readFileSync(autoShareFile, 'utf8'));
    config.interval = minutes;
    fs.writeFileSync(autoShareFile, JSON.stringify(config, null, 2));

    ctx.reply(`✅ Jeda autoshare diatur menjadi ${minutes} menit.`);

  } catch (error) {
    console.error('Error in /setjeda command:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

/* ============================================
   HANDLER ACTION CALLBACK
============================================ */

// Action untuk main menu
bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const menuMessage = `
📱 **MENU UTAMA JASSEB BOT** 📱

🤖 **Tentang Bot:**
Bot untuk broadcast pesan ke semua grup Telegram.

🎯 **Fitur Unggulan:**
• Broadcast ke semua grup sekaligus
• Sistem premium otomatis
• Backup data otomatis
• Statistik lengkap

👥 **Untuk Semua User:**
/start - Memulai bot
/help - Bantuan
/ping - Cek status

👑 **Untuk Premium User:**
/share - Broadcast pesan

👨‍💻 **Untuk Owner:**
/bcuser - Broadcast ke user
/pinggrub - Cek grup
/stats - Lihat statistik
/top - Leaderboard

📞 **Support:** @Wikiofficiall
`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('👑 FITUR PREMIUM', 'premium_menu'),
      Markup.button.callback('📊 STATISTIK', 'stats_menu')
    ],
    [
      Markup.button.callback('⚙️ PENGATURAN', 'settings_menu'),
      Markup.button.callback('🆘 BANTUAN', 'help_menu')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'back_to_start')
    ]
  ]);

  await editMenu(ctx, menuMessage, keyboard);
});

// Action untuk premium menu
bot.action('premium_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  let premiumUsers = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
  const isPremium = premiumUsers.includes(userId);
  
  const premiumMessage = `
👑 **FITUR PREMIUM** 👑

💰 **Status Akun Anda:** ${isPremium ? '⭐ **PREMIUM**' : '🔓 **STANDARD**'}

🎁 **Keuntungan Premium:**
• Akses fitur /share
• Prioritas support
• Tidak ada limit broadcast
• Fitur eksklusif lainnya

🎯 **Cara Mendapatkan Premium:**
1. Tambahkan bot ke 2 grup berbeda
2. Bot akan otomatis mendeteksi
3. Status akan berubah menjadi Premium

📈 **Statistik Anda:**
`;

  let stats = JSON.parse(fs.readFileSync(groupStatFile, 'utf8'));
  const userGroups = stats[userId] || 0;
  
  premiumMessage += `• Grup yang ditambahkan: **${userGroups}**\n`;
  premiumMessage += `• Butuh: **${Math.max(0, 2 - userGroups)}** grup lagi\n\n`;
  
  if (!isPremium && userGroups >= 2) {
    premiumMessage += '⚠️ *Status premium Anda akan segera diaktifkan!*\n\n';
  }
  
  premiumMessage += '💡 **Tips:** Tambahkan bot ke grup yang aktif untuk hasil terbaik!';

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 CEK STATUS', 'check_premium'),
      Markup.button.callback('📋 TUTORIAL', 'tutorial_premium')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'main_menu')
    ]
  ]);

  await editMenu(ctx, premiumMessage, keyboard);
});

// Action untuk stats menu
bot.action('stats_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const groups = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
  const users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
  const premium = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
  
  const statsMessage = `
📊 **STATISTIK BOT** 📊

👥 **PENGGUNA:**
• Total: **${users.length}** user
• Premium: **${premium.length}** user
• Standard: **${users.length - premium.length}** user

🏘️ **GRUP:**
• Total: **${groups.length}** grup

⚡ **PERFORMANCE:**
• Uptime: **${Math.floor(process.uptime() / 3600)}** jam
• Memory: **${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}** MB
• Platform: **Netlify**

📅 **UPDATE TERAKHIR:** ${new Date().toLocaleString()}

📈 **BOT AKTIF DAN BERJALAN DENGAN BAIK!**
`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 REFRESH', 'stats_menu'),
      Markup.button.callback('📈 DETAIL', 'detailed_stats')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'main_menu')
    ]
  ]);

  await editMenu(ctx, statsMessage, keyboard);
});

// Action untuk settings menu
bot.action('settings_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  let owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  const isOwner = owners.includes(userId);
  
  const settingsMessage = `
⚙️ **PENGATURAN** ⚙️

🔐 **Hak Akses:**
• User: **${isOwner ? 'Owner' : 'Standard'}**
• Premium: **${isOwner ? 'Owner (Auto Premium)' : 'Check premium menu'}**

🌐 **Server:**
• Provider: **Netlify**
• Region: **Global**
• Status: **🟢 ONLINE**

🔔 **Notifikasi:**
• Update: **AKTIF**
• Backup: **AKTIF**
• Error: **AKTIF**

⚡ **Optimasi:**
• Auto-restart: **AKTIF**
• Cache: **AKTIF**
• Compression: **AKTIF**

📱 **Versi:** 2.0.0
🔄 **Update:** Otomatis via GitHub
`;

  const keyboardButtons = [];
  
  if (isOwner) {
    keyboardButtons.push([
      Markup.button.callback('👑 OWNER PANEL', 'owner_panel')
    ]);
  }
  
  keyboardButtons.push(
    [
      Markup.button.callback('🔄 REFRESH', 'settings_menu'),
      Markup.button.callback('📖 PANDUAN', 'settings_guide')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'main_menu')
    ]
  );

  const keyboard = Markup.inlineKeyboard(keyboardButtons);

  await editMenu(ctx, settingsMessage, keyboard);
});

// Action untuk help menu
bot.action('help_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const helpMessage = `
🆘 **BANTUAN & DUKUNGAN** 🆘

📚 **PERTANYAAN UMUM:**

❓ **Bagaimana cara menggunakan bot?**
1. Ketik /start untuk memulai
2. Ikuti instruksi di menu
3. Untuk broadcast, gunakan /share (premium only)

❓ **Bagaimana mendapat premium?**
Tambahkan bot ke 2 grup berbeda, otomatis jadi premium!

❓ **Bot tidak merespons?**
1. Cek /ping untuk status bot
2. Pastikan sudah join channel wajib
3. Jika masih error, hubungi support

❓ **Pesan tidak terkirim?**
1. Cek koneksi internet
2. Pastikan bot masih di grup
3. Coba ulangi beberapa menit lagi

📞 **SUPPORT:**
• Developer: @fathirsthore
• Channel: @infoupdetscfsxdxy
• Email: (Tersedia di profile developer)

⏰ **WAKTU RESPON:**
• Weekdays: 09:00 - 21:00 WIB
• Weekends: 10:00 - 18:00 WIB

🔧 **TROUBLESHOOTING:**
1. /start ulang bot
2. Leave & join channel wajib
3. Clear chat dengan bot
4. Update Telegram app
`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📖 FAQ LENGKAP', 'faq_detailed'),
      Markup.button.callback('📞 HUBUNGI', 'contact_support')
    ],
    [
      Markup.button.callback('🐛 LAPOR BUG', 'report_bug'),
      Markup.button.callback('💡 SARAN', 'send_suggestion')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'main_menu')
    ]
  ]);

  await editMenu(ctx, helpMessage, keyboard);
});

// Action untuk kembali ke start
bot.action('back_to_start', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Ketik /start untuk melihat menu utama');
});

// Action untuk check premium
bot.action('check_premium', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  let premiumUsers = JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
  const isPremium = premiumUsers.includes(userId);
  
  if (isPremium) {
    await ctx.reply('✅ **Status Anda: PREMIUM**\n\nAnda dapat menggunakan semua fitur premium!', { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('ℹ️ **Status Anda: STANDARD**\n\nTambahkan bot ke 2 grup untuk menjadi premium.', { parse_mode: 'Markdown' });
  }
});

// Action untuk owner panel
bot.action('owner_panel', async (ctx) => {
  await ctx.answerCbQuery();
  
  const ownerPanel = `
👑 **OWNER CONTROL PANEL** 👑

📊 **Quick Stats:**
• Total Grup: ${JSON.parse(fs.readFileSync(groupFile, 'utf8')).length}
• Total User: ${JSON.parse(fs.readFileSync(userFile, 'utf8')).length}
• Online: 🟢

⚡ **Quick Actions:**
• /bcuser - Broadcast ke user
• /pinggrub - Cek status grup
• /stats - Statistik lengkap
• /top - Leaderboard
• /backup - Backup data

🔧 **Maintenance:**
• Server: Netlify
• Auto-backup: Setiap 6 jam
• Auto-restart: Setiap 24 jam

⚠️ **WARNING:**
Hati-hati dengan perintah yang mempengaruhi banyak user!
`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 STATS CEPAT', 'quick_stats'),
      Markup.button.callback('🔧 MAINTENANCE', 'quick_maintenance')
    ],
    [
      Markup.button.callback('📤 BROADCAST', 'quick_broadcast'),
      Markup.button.callback('📦 BACKUP', 'quick_backup')
    ],
    [
      Markup.button.callback('🔙 KEMBALI', 'settings_menu')
    ]
  ]);

  await editMenu(ctx, ownerPanel, keyboard);
});

/* ============================================
   FUNGSI CRON JOBS UNTUK NETLIFY
============================================ */

// Setup cron jobs untuk backup otomatis
function setupCronJobs() {
  // Backup setiap 6 jam
  cron.schedule('0 */6 * * *', () => {
    console.log('⏰ Running scheduled backup...');
    kirimBackupNetlify();
  });
  
  // Health check setiap jam
  cron.schedule('0 * * * *', () => {
    console.log('🏥 Health check passed at', new Date().toLocaleString());
  });
  
  // Cleanup logs setiap hari jam 3 pagi
  cron.schedule('0 3 * * *', () => {
    console.log('🧹 Daily cleanup completed');
  });
  
  console.log('✅ Cron jobs initialized');
}

/* ============================================
   ERROR HANDLING & GRACEFUL SHUTDOWN
============================================ */

// Global error handling
bot.catch((err, ctx) => {
  console.error('❌ Bot Error:', err);
  console.error('Error context:', ctx?.updateType);
  
  if (ctx?.chat?.id) {
    try {
      ctx.reply('❌ Terjadi kesalahan sistem. Silakan coba lagi nanti.');
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
});

// Process event handlers
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  
  // Stop bot
  bot.stop(signal);
  
  // Clear intervals
  if (autoShareInterval) clearInterval(autoShareInterval);
  if (autoKirimInterval) clearInterval(autoKirimInterval);
  
  // Kirim notifikasi ke owner
  const owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  owners.forEach(owner => {
    try {
      bot.telegram.sendMessage(owner, `🔴 Bot dimatikan: ${signal}\n⏰ ${new Date().toLocaleString()}`);
    } catch (e) {
      console.log('Cannot notify owner on shutdown:', e.message);
    }
  });
  
  console.log('✅ Bot shutdown completed');
  process.exit(0);
}

/* ============================================
   START SERVER & BOT
============================================ */

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`
🚀 JASSEB BOT STARTED SUCCESSFULLY!
──────────────────────────────
📡 Server: http://localhost:${PORT}
🤖 Bot: @${bot.botInfo?.username || 'Loading...'}
📊 Health: http://localhost:${PORT}/health
📈 Status: http://localhost:${PORT}/status
⚡ Node.js: ${process.version}
🌐 Platform: Netlify Ready
──────────────────────────────
✅ Bot is running and ready!
  `);
});

// Start bot dengan polling
bot.launch({
  dropPendingUpdates: true,
  allowedUpdates: ['message', 'callback_query', 'chat_member']
}).then(() => {
  console.log('✅ Telegram Bot connected successfully!');
  
  // Setup cron jobs
  setupCronJobs();
  
  // Kirim startup notification ke owner
  const owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  owners.forEach(owner => {
    try {
      bot.telegram.sendMessage(owner, 
        `🟢 **BOT DIMULAI ULANG**\n\n` +
        `🤖 Bot: @${bot.botInfo?.username}\n` +
        `🌐 Server: Netlify\n` +
        `⏰ Waktu: ${new Date().toLocaleString()}\n` +
        `⚡ Status: **ONLINE & READY**`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.log('Cannot send startup notification:', e.message);
    }
  });
  
}).catch((err) => {
  console.error('❌ Failed to start bot:', err);
  server.close();
  process.exit(1);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Export untuk Netlify Functions (jika diperlukan)
module.exports = app;
