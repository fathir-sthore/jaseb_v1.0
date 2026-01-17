const { Telegraf, Markup } = require("telegraf");
const express = require('express');
const fs = require("fs");
const path = require("path");

// Buat app Express untuk Vercel
const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi bot dengan token dari environment variable
const BOT_TOKEN = process.env.BOT_TOKEN || "8592407821:AAGLS0NVlggw7S_3MVKAFqipQmah46fJGz4";
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

// Endpoint untuk health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Bot JASSEB is running', 
    timestamp: new Date().toISOString(),
    owner: ownerId,
    version: '2.0'
  });
});

// Endpoint untuk webhook (opsional)
app.post('/webhook', (req, res) => {
  // Jika menggunakan webhook
  res.sendStatus(200);
});

// Endpoint untuk status bot
app.get('/status', (req, res) => {
  try {
    const groups = JSON.parse(fs.readFileSync(groupFile));
    const users = JSON.parse(fs.readFileSync(userFile));
    const premium = JSON.parse(fs.readFileSync(premiumFile));
    
    res.json({
      status: 'online',
      groups: groups.length,
      users: users.length,
      premium: premium.length,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Fungsi untuk inisialisasi database
function initializeDatabase() {
  // Pastikan folder database ada
  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
  }
  
  // Inisialisasi file-file database
  const files = [
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
  
  files.forEach(({ file, default: defaultValue }) => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
      console.log(`Created database file: ${file}`);
    }
  });
  
  console.log('Database initialized successfully');
}

// Panggil inisialisasi database
initializeDatabase();

/* ============================================
   FUNGSI UTILITAS
============================================ */

// Fungsi cek join channel
async function cekJoinChannel(userId, ctx) {
  for (const ch of channelWajib) {
    try {
      const m = await ctx.telegram.getChatMember(ch, userId);
      if (!["member", "administrator", "creator"].includes(m.status)) {
        return false;
      }
    } catch (error) {
      console.log(`Failed to check channel ${ch}:`, error.message);
      return false;
    }
  }
  return true;
}

// Array gambar random
const randomImages = [
  "https://files.catbox.moe/ihog4a.jpg",
  "https://files.catbox.moe/ihog4a.jpg",
  "https://files.catbox.moe/ihog4a.jpg"
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
      await ctx.reply('Maaf, terjadi kesalahan saat mengedit pesan. Mengirim pesan baru...', {
        parse_mode: 'HTML'
      });
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

// Fungsi delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi kirim backup
async function kirimBackup() {
  try {
    const owners = JSON.parse(fs.readFileSync(ownerFile));
    const files = [
      groupFile,
      groupStatFile,
      userFile,
      premiumFile,
      ownerFile,
      blacklistFile,
      presetFile,
      autoShareFile,
      autoKirimFile
    ];

    for (const ownerId of owners) {
      try {
        for (const file of files) {
          if (fs.existsSync(file)) {
            await bot.telegram.sendDocument(ownerId, { source: file });
          }
        }
        console.log(`✅ Backup terkirim ke owner ${ownerId}`);
      } catch (e) {
        console.log(`❌ Gagal kirim backup ke ${ownerId}: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error in backup function:', error);
  }
}

/* ============================================
   MIDDLEWARE GLOBAL
============================================ */

// Middleware cek join channel
bot.use(async (ctx, next) => {
  try {
    // Skip untuk perintah khusus
    if (ctx.message && ctx.message.text) {
      const text = ctx.message.text.toLowerCase();
      if (text.includes('/start') || text.includes('/ping') || text.includes('/status')) {
        return next();
      }
    }

    const uid = ctx.from?.id;
    if (!uid) return;

    // Blacklist check
    if (fs.existsSync(blacklistFile)) {
      const bl = JSON.parse(fs.readFileSync(blacklistFile));
      if (bl.includes(uid)) {
        return ctx.reply("❌ Anda diblokir dari menggunakan bot ini.");
      }
    }

    const ok = await cekJoinChannel(uid, ctx);
    if (!ok) {
      return ctx.reply(
        `❌ Kamu harus join channel berikut dulu:\n` +
        channelWajib.map(c => `📢 ${c}`).join("\n") +
        `\n\nSetelah join, klik /start lagi.`,
        Markup.inlineKeyboard([
          ...channelWajib.map(c =>
            Markup.button.url(`Wajib Join ${c}`, `https://t.me/${c.replace("@", "")}`)
          ),
          Markup.button.url("WAJIB Join Developer & Info SC no enc", `https://t.me/${channelGimick.replace("@", "")}`)
        ], { columns: 1 })
      );
    }
    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next();
  }
});

/* ============================================
   HANDLER EVENT
============================================ */

// Handler bot ditambahkan ke grup
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
    const username = adder.username ? `@${adder.username}` : "(tanpa username)";

    // Tambahkan ke grub.json jika belum ada
    let groups = [];
    if (fs.existsSync(groupFile)) {
      groups = JSON.parse(fs.readFileSync(groupFile));
    }
    
    if (!groups.includes(groupId)) {
      groups.push(groupId);
      fs.writeFileSync(groupFile, JSON.stringify(groups, null, 2));
    }

    // Hitung jumlah grup yang ditambahkan
    let stats = {};
    if (fs.existsSync(groupStatFile)) {
      stats = JSON.parse(fs.readFileSync(groupStatFile));
    }
    
    stats[adderId] = (stats[adderId] || 0) + 1;
    fs.writeFileSync(groupStatFile, JSON.stringify(stats, null, 2));

    const totalUserAdded = stats[adderId];

    // Tambahkan ke premium jika pertama kali (grup ke-2)
    let premiumUsers = [];
    if (fs.existsSync(premiumFile)) {
      premiumUsers = JSON.parse(fs.readFileSync(premiumFile));
    }
    
    if (totalUserAdded === 2 && !premiumUsers.includes(adderId)) {
      premiumUsers.push(adderId);
      fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
      
      // Beritahu user
      try {
        await ctx.telegram.sendMessage(adderId, 
          `🎉 Selamat! Anda sekarang mendapatkan akses PREMIUM!\n` +
          `Anda telah menambahkan bot ke ${totalUserAdded} grup.\n` +
          `Sekarang Anda bisa menggunakan fitur /share`
        );
      } catch (e) {
        console.log('Failed to notify user:', e.message);
      }
    }

    // Kirim notifikasi ke owner
    if (totalUserAdded >= 2) {
      const owners = JSON.parse(fs.readFileSync(ownerFile));
      for (const owner of owners) {
        try {
          await ctx.telegram.sendMessage(owner, 
            `➕ Bot Ditambahkan ke grup baru!\n\n` +
            `👤 Oleh: ${username}\n` +
            `🆔 ID: \`${adderId}\`\n` +
            `🏷 Nama Grup: *${groupName}*\n` +
            `🔢 Total Grup oleh User: *${totalUserAdded}*\n` +
            `📦 Total Grup Bot: *${groups.length}*`, 
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          console.log(`Failed to notify owner ${owner}:`, e.message);
        }
      }
    }
  } catch (error) {
    console.error('Error in new_chat_members handler:', error);
  }
});

/* ============================================
   HANDLER COMMAND
============================================ */

// Command /start
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : 'Pengguna';
    const RandomBgtJir = getRandomImage();

    // Simpan user ke database
    let users = [];
    if (fs.existsSync(userFile)) {
      users = JSON.parse(fs.readFileSync(userFile));
    }
    
    if (!users.includes(userId)) {
      users.push(userId);
      fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    }

    await ctx.replyWithPhoto(RandomBgtJir, {
      caption: `<blockquote>
╭──( 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗧𝗢 )──╮
╰──( 𝗕𝗢𝗧  𝗝𝗔𝗦𝗦𝗘𝗕  )──╯

╭─────( 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐒𝐈  )──────╮
│✧ Developer : 𝗙𝗔𝗧𝗛𝗜𝗥 𝗦𝗧𝗛𝗢𝗥𝗘 
│✧ Author : 𝗙𝗔𝗧𝗛𝗜𝗥 𝗦𝗧𝗛𝗢𝗥𝗘 
│✧ Version : 2.0
│✧ encourager : [all buyer, ortu] 
│✧ Deskripsi : ⤸ 
│✧ Language 𝖩𝖤𝖯𝖠𝖭𝖦  🇯🇵
│
│<b>このボットは</b>
│<b>ルーム/グループにメッセージを配信するサービス</b>
│<b>ボットです。これにより、</b>
│<b>ユーザーはボット内のすべてのルーム/</b>
│<b>グループにメッセージを素早く共有できます。</b>
│<b>ボットアクセスを</b>
│<b>取得するには、</b>
│<b>ボットをルーム/グループに2回入力すると、自動的</b>
│<b>にプレミアムアクセスが付与されます。</b>
│
│✧ Language INDONESIA 🇮🇩
│ 𝘽𝙤𝙩 𝙞𝙣𝙞 𝙖𝙙𝙖𝙡𝙖𝙝 𝙗𝙤𝙩 𝙟𝙖𝙨𝙖 𝙨𝙚𝙗𝙖𝙧 𝙠𝙚
│     𝙧𝙤𝙤𝙢/𝙜𝙧𝙪𝙗 𝙪𝙣𝙩𝙪𝙠 𝙢𝙚𝙢𝙥𝙚𝙧𝙢𝙪𝙙𝙖𝙝 
│     𝙥𝙚𝙣𝙜𝙜𝙪𝙣𝙖 𝙖𝙜𝙖𝙧 𝙘𝙚𝙥𝙖𝙩 𝙢𝙚𝙢𝙗𝙖𝙜𝙞 𝙥𝙚𝙨𝙖𝙣
│     𝙠𝙚𝙨𝙚𝙢𝙪𝙖 𝙧𝙤𝙤𝙢/𝙜𝙧𝙪𝙗 𝙮𝙖𝙣𝙜 𝙖𝙙𝙖 𝙙𝙞 𝙗𝙤𝙩
│     𝙙𝙖𝙣 𝙟𝙞𝙠𝙖 𝙖𝙣𝙙𝙖 𝙞𝙣𝙜𝙞𝙣 𝙢𝙚𝙣𝙙𝙖𝙥𝙖𝙩𝙠𝙖𝙣
│     𝙖𝙠𝙨𝙚𝙨 𝙗𝙤𝙩 𝙢𝙖𝙨𝙪𝙠𝙞𝙣 𝙗𝙤𝙩 𝙠𝙚 
│     𝙧𝙤𝙤𝙢/𝙜𝙧𝙪𝙗 𝙨𝙚𝙗𝙖𝙣𝙮𝙖𝙠 2𝙭 𝙤𝙩𝙤𝙢𝙖𝙩𝙞𝙨
│     𝙖𝙠𝙖𝙣 𝙢𝙚𝙣𝙙𝙖𝙥𝙖𝙩𝙠𝙖𝙣 𝙖𝙠𝙨𝙚𝙨 𝙥𝙧𝙚𝙢𝙞𝙪𝙢
╰─────────────────────╯</blockquote>`,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('𝙈𝙀𝙉𝙐 𝙐𝙏𝘼𝙈𝘼', 'Daxingnot1'),
          Markup.button.callback('KHUSUS 𝗙𝗔𝗧𝗛𝗜𝗥 𝗦𝗧𝗛𝗢𝗥𝗘', 'fathirofsc2'),
        ],
        [
          Markup.button.url('𝘿𝙀𝙑𝙀𝙇𝙊𝙋𝙀𝙍', 'https://t.me/Wikiofficiall'),
        ]
      ])
    });
    
    console.log(`User ${username} (${userId}) started the bot`);
  } catch (error) {
    console.error('Error in /start command:', error);
    ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
});

// Command /share
bot.command("share", async ctx => {
  try {
    const senderId = ctx.from.id;
    const replyMsg = ctx.message.reply_to_message;

    // Cek premium
    let premiumUsers = [];
    if (fs.existsSync(premiumFile)) {
      premiumUsers = JSON.parse(fs.readFileSync(premiumFile));
    }
    
    if (!premiumUsers.includes(senderId)) {
      return ctx.reply("❌ Kamu belum menambahkan bot ini ke 2 grup telegram.\n\nJika ingin menggunakan fitur ini, kamu harus menambahkan bot ke dalam minimal 2 grup.", {
        parse_mode: "Markdown"
      });
    }

    if (!replyMsg) {
      return ctx.reply("🪧 ☇ Reply pesan yang ingin dibagikan / dipromosikan");
    }

    let groups = [];
    if (fs.existsSync(groupFile)) {
      groups = JSON.parse(fs.readFileSync(groupFile));
    }
    
    if (groups.length === 0) {
      return ctx.reply("❌ Belum ada grup yang terdaftar.");
    }

    let sukses = 0;
    let gagal = 0;

    const progressMsg = await ctx.reply(`⏳ Mengirim ke ${groups.length} grup... 0%`, { parse_mode: "Markdown" });

    for (let i = 0; i < groups.length; i++) {
      const groupId = groups[i];
      try {
        await ctx.telegram.forwardMessage(groupId, ctx.chat.id, replyMsg.message_id);
        sukses++;
      } catch (err) {
        gagal++;
      }
      
      // Update progress setiap 5 grup
      if (i % 5 === 0 || i === groups.length - 1) {
        const percent = Math.round(((i + 1) / groups.length) * 100);
        try {
          await ctx.telegram.editMessageText(
            progressMsg.chat.id,
            progressMsg.message_id,
            null,
            `⏳ Mengirim ke ${groups.length} grup... ${percent}%`
          );
        } catch (e) {
          // Ignore edit errors
        }
      }
      
      await delay(1500);
    }

    // Hapus progress message
    try {
      await ctx.telegram.deleteMessage(progressMsg.chat.id, progressMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    await ctx.reply(
      `✅ *Selesai!*\n\n` +
      `📊 **Statistik:**\n` +
      `✓ Sukses: *${sukses}* grup\n` +
      `✗ Gagal: *${gagal}* grup\n` +
      `📈 Total: *${groups.length}* grup`,
      { parse_mode: "Markdown" }
    );
    
    console.log(`Share completed by ${senderId}: ${sukses} success, ${gagal} failed`);
  } catch (error) {
    console.error('Error in /share command:', error);
    ctx.reply('❌ Terjadi kesalahan saat membagikan pesan.');
  }
});

// Command /autoshare
bot.command("autoshare", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Fitur ini hanya untuk owner.");
    }

    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) {
      return ctx.reply("🪧 ☇ Reply pesan yang ingin dibagikan / dipromosikan");
    }

    let intervalConfig = { interval: 10 };
    if (fs.existsSync(autoShareFile)) {
      intervalConfig = JSON.parse(fs.readFileSync(autoShareFile));
    }
    
    const jedaMenit = intervalConfig.interval || 10;

    if (autoShareInterval) {
      clearInterval(autoShareInterval);
      autoShareInterval = null;
    }

    await ctx.reply(`✅ ☇ Autoshare dimulai. Pesan akan dikirim otomatis setiap ${jedaMenit} menit`);

    let groups = [];
    if (fs.existsSync(groupFile)) {
      groups = JSON.parse(fs.readFileSync(groupFile));
    }

    autoShareInterval = setInterval(async () => {
      try {
        let sukses = 0;
        let gagal = 0;

        for (const groupId of groups) {
          try {
            await ctx.telegram.forwardMessage(groupId, ctx.chat.id, replyMsg.message_id);
            sukses++;
          } catch (e) {
            gagal++;
          }
          await delay(2000);
        }

        console.log(`[AutoShare] ${new Date().toLocaleString()} - Sukses: ${sukses} | Gagal: ${gagal}`);
      } catch (error) {
        console.error('Error in autoshare interval:', error);
      }
    }, jedaMenit * 60 * 1000);
  } catch (error) {
    console.error('Error in /autoshare command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengaktifkan autoshare.');
  }
});

// Command /setjeda
bot.command("setjeda", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa mengatur jeda autoshare.");
    }

    const args = ctx.message.text.split(" ");
    const menit = parseInt(args[1]);

    if (isNaN(menit) || menit < 1) {
      return ctx.reply("❌ Format salah. Gunakan: /setjeda <menit>, contoh: /setjeda 15");
    }

    const config = { interval: menit };
    fs.writeFileSync(autoShareFile, JSON.stringify(config, null, 2));

    ctx.reply(`✅ Jeda autoshare diubah menjadi setiap ${menit} menit`);
  } catch (error) {
    console.error('Error in /setjeda command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengatur jeda.');
  }
});

// Command /pinggrub
bot.command("pinggrub", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ ☇ Akses perintah hanya untuk owner");

    let groups = [];
    if (fs.existsSync(groupFile)) {
      groups = JSON.parse(fs.readFileSync(groupFile));
    }
    
    let updatedGroups = [];
    let total = groups.length;
    let aktif = 0;
    let gagal = 0;

    const progressMsg = await ctx.reply(`📡 Memeriksa ${total} grup... 0%`);

    for (let i = 0; i < groups.length; i++) {
      const groupId = groups[i];
      try {
        await ctx.telegram.sendChatAction(groupId, "typing");
        updatedGroups.push(groupId);
        aktif++;
      } catch (err) {
        gagal++;
      }
      
      // Update progress
      if (i % 5 === 0 || i === groups.length - 1) {
        const percent = Math.round(((i + 1) / groups.length) * 100);
        try {
          await ctx.telegram.editMessageText(
            progressMsg.chat.id,
            progressMsg.message_id,
            null,
            `📡 Memeriksa ${total} grup... ${percent}%`
          );
        } catch (e) {
          // Ignore edit errors
        }
      }
      
      await delay(1000);
    }

    // Hapus progress message
    try {
      await ctx.telegram.deleteMessage(progressMsg.chat.id, progressMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    // Simpan grup yang aktif
    fs.writeFileSync(groupFile, JSON.stringify(updatedGroups, null, 2));

    const logText = 
      `📡 **Hasil Pengecekan Grup**\n\n` +
      `📊 **Statistik:**\n` +
      `• Total Grup: *${total}*\n` +
      `• Grup Aktif: *${aktif}*\n` +
      `• Grup Tidak Aktif: *${gagal}*\n\n` +
      `✅ Data grup telah diperbarui.`;
    
    ctx.reply(logText, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /pinggrub command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengecek grup.');
  }
});

// Command /bcuser
bot.command("bcuser", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Akses hanya untuk owner.");
    }

    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) {
      return ctx.reply("❌ Balas pesan yang mau di-broadcast ke semua user.");
    }

    let userList = [];
    if (fs.existsSync(userFile)) {
      userList = JSON.parse(fs.readFileSync(userFile));
    }
    
    if (userList.length === 0) {
      return ctx.reply("❌ Belum ada user yang terdaftar.");
    }

    let sukses = 0;
    let gagal = 0;

    const progressMsg = await ctx.reply(`📢 Mengirim ke ${userList.length} user... 0%`);

    for (let i = 0; i < userList.length; i++) {
      const userId = userList[i];
      try {
        await ctx.telegram.forwardMessage(userId, ctx.chat.id, replyMsg.message_id);
        sukses++;
      } catch (err) {
        gagal++;
      }
      
      // Update progress
      if (i % 10 === 0 || i === userList.length - 1) {
        const percent = Math.round(((i + 1) / userList.length) * 100);
        try {
          await ctx.telegram.editMessageText(
            progressMsg.chat.id,
            progressMsg.message_id,
            null,
            `📢 Mengirim ke ${userList.length} user... ${percent}%`
          );
        } catch (e) {
          // Ignore edit errors
        }
      }
      
      await delay(500); // Jeda lebih pendek untuk user
    }

    // Hapus progress message
    try {
      await ctx.telegram.deleteMessage(progressMsg.chat.id, progressMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    ctx.reply(
      `✅ **Broadcast Selesai!**\n\n` +
      `📊 **Statistik:**\n` +
      `• Sukses: *${sukses}* user\n` +
      `• Gagal: *${gagal}* user\n` +
      `• Total: *${userList.length}* user`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error('Error in /bcuser command:', error);
    ctx.reply('❌ Terjadi kesalahan saat broadcast.');
  }
});

// Command /set
bot.command("set", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa set.");

    const args = ctx.message.text.split(" ");
    const index = parseInt(args[1]);
    const text = args.slice(2).join(" ");

    if (isNaN(index) || index < 1 || index > 20) return ctx.reply("❌ Nomor harus 1-20.\nContoh: /set 1 Pesan rahasia");
    if (!text) return ctx.reply("❌ Teks tidak boleh kosong.");

    let presets = [];
    if (fs.existsSync(presetFile)) {
      presets = JSON.parse(fs.readFileSync(presetFile));
    }
    
    presets[index - 1] = text;
    fs.writeFileSync(presetFile, JSON.stringify(presets, null, 2));

    ctx.reply(`✅ Pesan slot ${index} disimpan:\n\n${text}`);
  } catch (error) {
    console.error('Error in /set command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menyimpan pesan.');
  }
});

// Command /del
bot.command("del", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa hapus.");

    const args = ctx.message.text.split(" ");
    const index = parseInt(args[1]);

    if (isNaN(index) || index < 1 || index > 20) return ctx.reply("❌ Nomor harus 1-20.\nContoh: /del 1");

    let presets = [];
    if (fs.existsSync(presetFile)) {
      presets = JSON.parse(fs.readFileSync(presetFile));
    }
    
    presets[index - 1] = "";
    fs.writeFileSync(presetFile, JSON.stringify(presets, null, 2));

    ctx.reply(`✅ Pesan slot ${index} dihapus.`);
  } catch (error) {
    console.error('Error in /del command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menghapus pesan.');
  }
});

// Command /list
bot.command("list", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa melihat daftar.");

    let presets = [];
    if (fs.existsSync(presetFile)) {
      presets = JSON.parse(fs.readFileSync(presetFile));
    }
    
    let teks = "📑 **Daftar Pesan Tersimpan:**\n\n";
    let found = false;
    
    presets.forEach((p, i) => {
      if (p && p.trim() !== "") {
        teks += `${i + 1}. ${p}\n\n`;
        found = true;
      }
    });

    if (!found) teks = "❌ Belum ada pesan yang disimpan.";
    ctx.reply(teks, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /list command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menampilkan daftar.');
  }
});

// Command /top
bot.command("top", async ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Akses hanya untuk owner.");

    let stats = {};
    if (fs.existsSync(groupStatFile)) {
      stats = JSON.parse(fs.readFileSync(groupStatFile));
    }
    
    if (Object.keys(stats).length === 0) return ctx.reply("❌ Belum ada data statistik.");

    // Ubah ke array dan sort
    let sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    let teks = "🏆 **Top User Penambahan Bot ke Grup**\n\n";
    
    let rank = 1;
    for (let [userId, count] of sorted) {
      teks += `${rank}. 👤 ID: \`${userId}\` ➜ ${count} grup\n`;
      rank++;
      if (rank > 10) break; // Tampilkan top 10 saja
    }

    teks += `\n📊 Total user: ${sorted.length}`;
    
    ctx.reply(teks, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /top command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menampilkan ranking.');
  }
});

// Command /addprem
bot.command("addprem", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa menambahkan premium.");

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    if (!targetId) return ctx.reply("❌ Format: /addprem <userId>\nContoh: /addprem 123456789");

    let data = [];
    if (fs.existsSync(premiumFile)) {
      data = JSON.parse(fs.readFileSync(premiumFile));
    }
    
    if (data.includes(targetId)) return ctx.reply("✅ User sudah premium.");

    data.push(targetId);
    fs.writeFileSync(premiumFile, JSON.stringify(data, null, 2));
    ctx.reply(`✅ Berhasil menambahkan \`${targetId}\` ke daftar premium.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /addprem command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menambahkan premium.');
  }
});

// Command /addowner
bot.command("addowner", ctx => {
  try {
    if (!ownerId.includes(ctx.from.id)) return ctx.reply("❌ Cuma owner asli yang bisa tambah owner.");
    
    const target = parseInt(ctx.message.text.split(" ")[1]);
    if (!target) return ctx.reply("❌ Format: /addowner <userId>\nContoh: /addowner 123456789");
    
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (owners.includes(target)) return ctx.reply("✅ User sudah menjadi owner.");
    
    owners.push(target);
    fs.writeFileSync(ownerFile, JSON.stringify(owners, null, 2));
    ctx.reply(`✅ \`${target}\` ditambahkan sebagai owner.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /addowner command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menambahkan owner.');
  }
});

// Command /delowner
bot.command("delowner", ctx => {
  try {
    if (!ownerId.includes(ctx.from.id)) return ctx.reply("❌ Cuma owner asli yang bisa hapus owner.");
    
    const target = parseInt(ctx.message.text.split(" ")[1]);
    if (!target) return ctx.reply("❌ Format: /delowner <userId>\nContoh: /delowner 123456789");
    
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    owners = owners.filter(id => id !== target);
    fs.writeFileSync(ownerFile, JSON.stringify(owners, null, 2));
    ctx.reply(`✅ \`${target}\` dihapus dari owner.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /delowner command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menghapus owner.');
  }
});

// Command /blokir
bot.command("blokir", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Cuma owner.");
    
    const target = parseInt(ctx.message.text.split(" ")[1]);
    if (!target) return ctx.reply("❌ Format: /blokir <userId>\nContoh: /blokir 123456789");
    
    let blacklist = [];
    if (fs.existsSync(blacklistFile)) {
      blacklist = JSON.parse(fs.readFileSync(blacklistFile));
    }
    
    if (blacklist.includes(target)) return ctx.reply("✅ User sudah diblokir.");
    
    blacklist.push(target);
    fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
    ctx.reply(`✅ \`${target}\` diblokir.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /blokir command:', error);
    ctx.reply('❌ Terjadi kesalahan saat memblokir user.');
  }
});

// Command /unblokir
bot.command("unblokir", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Cuma owner.");
    
    const target = parseInt(ctx.message.text.split(" ")[1]);
    if (!target) return ctx.reply("❌ Format: /unblokir <userId>\nContoh: /unblokir 123456789");
    
    let blacklist = [];
    if (fs.existsSync(blacklistFile)) {
      blacklist = JSON.parse(fs.readFileSync(blacklistFile));
    }
    
    blacklist = blacklist.filter(id => id !== target);
    fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
    ctx.reply(`✅ \`${target}\` diunblokir.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /unblokir command:', error);
    ctx.reply('❌ Terjadi kesalahan saat membuka blokir user.');
  }
});

// Command /auto
bot.command("auto", async (ctx) => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) {
      return ctx.reply("❌ Hanya owner yang bisa pakai perintah ini.");
    }

    const args = ctx.message.text.slice(6).trim();
    const onOff = args.split(" ")[0];
    const text = args.slice(onOff.length).trim();

    let cfg = { status: false, text: "" };
    if (fs.existsSync(autoKirimFile)) {
      cfg = JSON.parse(fs.readFileSync(autoKirimFile));
    }

    if (onOff === "off") {
      if (!cfg.status) return ctx.reply("ℹ️ Auto-kirim sudah mati.");
      
      if (autoKirimInterval) {
        clearInterval(autoKirimInterval);
        autoKirimInterval = null;
      }
      
      cfg.status = false;
      fs.writeFileSync(autoKirimFile, JSON.stringify(cfg, null, 2));
      return ctx.reply("✅ Auto-kirim dimatikan.");
    }

    if (onOff === "on") {
      if (!text) return ctx.reply("❌ Format: /auto on <teks>\nContoh: /auto on Promo spesial hari ini!");
      
      if (cfg.status) return ctx.reply("ℹ️ Auto-kirim sudah aktif. /auto off dulu kalau mau ganti.");

      cfg.status = true;
      cfg.text = text;
      fs.writeFileSync(autoKirimFile, JSON.stringify(cfg, null, 2));

      const kirim = async () => {
        try {
          let groups = [];
          if (fs.existsSync(groupFile)) {
            groups = JSON.parse(fs.readFileSync(groupFile));
          }
          
          let sukses = 0;
          let gagal = 0;
          
          for (const g of groups) {
            try { 
              await ctx.telegram.sendMessage(g, text); 
              sukses++;
            } catch (e) {
              gagal++;
            }
            await delay(1000);
          }
          
          console.log(`[AutoKirim] ${new Date().toLocaleString()} - Sukses: ${sukses}, Gagal: ${gagal}`);
        } catch (error) {
          console.error('Error in auto kirim:', error);
        }
      };

      // Langsung kirim sekali
      await kirim();
      ctx.reply(
        `✅ **Auto-kirim AKTIF** (1x/jam)\n\n` +
        `📝 **Pesan:**\n${text}\n\n` +
        `📊 Pesan telah dikirim ke semua grup.`,
        { parse_mode: "Markdown" }
      );

      // Teruskan setiap 1 jam
      autoKirimInterval = setInterval(kirim, 60 * 60 * 1000);
      return;
    }

    ctx.reply(
      "❌ **Format Perintah:**\n\n" +
      "🚀 **Aktifkan:**\n`/auto on <teks>`\nContoh: `/auto on Promo hari ini!`\n\n" +
      "⛔ **Matikan:**\n`/auto off`",
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error('Error in /auto command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengatur auto-kirim.');
  }
});

// Command /backup
bot.command("backup", async (ctx) => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa ambil backup.");

    const files = [
      { name: "Grup", file: groupFile },
      { name: "Statistik", file: groupStatFile },
      { name: "User", file: userFile },
      { name: "Premium", file: premiumFile },
      { name: "Owner", file: ownerFile },
      { name: "Blacklist", file: blacklistFile },
      { name: "Preset", file: presetFile },
      { name: "AutoShare", file: autoShareFile },
      { name: "AutoKirim", file: autoKirimFile }
    ];

    const progressMsg = await ctx.reply("📦 Mengumpulkan backup... 0%");

    let sentCount = 0;
    for (let i = 0; i < files.length; i++) {
      const { name, file } = files[i];
      if (fs.existsSync(file)) {
        try {
          await ctx.telegram.sendDocument(ctx.from.id, { 
            source: file,
            filename: `${name.toLowerCase()}.json`
          });
          sentCount++;
        } catch (e) {
          console.log(`❌ Gagal kirim ${file}: ${e.message}`);
        }
      }
      
      // Update progress
      const percent = Math.round(((i + 1) / files.length) * 100);
      try {
        await ctx.telegram.editMessageText(
          progressMsg.chat.id,
          progressMsg.message_id,
          null,
          `📦 Mengumpulkan backup... ${percent}%`
        );
      } catch (e) {
        // Ignore edit errors
      }
    }

    // Hapus progress message
    try {
      await ctx.telegram.deleteMessage(progressMsg.chat.id, progressMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    ctx.reply(`✅ ${sentCount} file backup telah dikirim.`);
  } catch (error) {
    console.error('Error in /backup command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengambil backup.');
  }
});

// Command /delprem
bot.command("delprem", ctx => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa menghapus premium.");

    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    if (!targetId) return ctx.reply("❌ Format: /delprem <userId>\nContoh: /delprem 123456789");

    let data = [];
    if (fs.existsSync(premiumFile)) {
      data = JSON.parse(fs.readFileSync(premiumFile));
    }
    
    if (!data.includes(targetId)) return ctx.reply("❌ ID tersebut tidak ada di daftar premium.");

    data = data.filter(id => id !== targetId);
    fs.writeFileSync(premiumFile, JSON.stringify(data, null, 2));
    ctx.reply(`✅ Berhasil menghapus \`${targetId}\` dari daftar premium.`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /delprem command:', error);
    ctx.reply('❌ Terjadi kesalahan saat menghapus premium.');
  }
});

// Command /stats
bot.command("stats", async (ctx) => {
  try {
    const senderId = ctx.from.id;
    let owners = [];
    if (fs.existsSync(ownerFile)) {
      owners = JSON.parse(fs.readFileSync(ownerFile));
    }
    
    if (!owners.includes(senderId)) return ctx.reply("❌ Hanya owner yang bisa melihat stats.");

    let groups = [];
    if (fs.existsSync(groupFile)) {
      groups = JSON.parse(fs.readFileSync(groupFile));
    }
    
    let users = [];
    if (fs.existsSync(userFile)) {
      users = JSON.parse(fs.readFileSync(userFile));
    }
    
    let premium = [];
    if (fs.existsSync(premiumFile)) {
      premium = JSON.parse(fs.readFileSync(premiumFile));
    }
    
    let blacklist = [];
    if (fs.existsSync(blacklistFile)) {
      blacklist = JSON.parse(fs.readFileSync(blacklistFile));
    }

    const statsText = 
      `📊 **STATISTIK BOT JASSEB**\n\n` +
      `👥 **User:**\n` +
      `• Total User: *${users.length}*\n` +
      `• Premium User: *${premium.length}*\n` +
      `• User Diblokir: *${blacklist.length}*\n\n` +
      `🏘️ **Grup:**\n` +
      `• Total Grup: *${groups.length}*\n\n` +
      `🔄 **Sistem:**\n` +
      `• Auto Share: ${autoShareInterval ? 'Aktif' : 'Tidak Aktif'}\n` +
      `• Auto Kirim: ${autoKirimInterval ? 'Aktif' : 'Tidak Aktif'}\n\n` +
      `⏰ **Waktu Server:**\n` +
      `${new Date().toLocaleString('id-ID')}`;

    ctx.reply(statsText, { parse_mode: "Markdown" });
  } catch (error) {
    console.error('Error in /stats command:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengambil statistik.');
  }
});

/* ============================================
   HANDLER ACTION (CALLBACK)
============================================ */

// Action Daxingnot1
bot.action('Daxingnot1', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 BACK', 'startback')],
    ]);

    const caption = `<blockquote>
✦━━━━━━[  𝗕𝗢𝗧 𝗝𝗔𝗦𝗦𝗘𝗕  ]━━━━━━✦
  ⌬  𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗯𝘆 𝗙𝗔𝗧𝗛𝗜𝗥 𝗦𝗧𝗛𝗢𝗥𝗘 ⌬
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⟡ 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗦𝗜 𝗕𝗢𝗧 ⟡
› 𝖣𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋 : FATHIR STHORE
› 𝖠𝗎𝗍𝗁𝗈𝗋    : Daxyinz
› 𝖵𝖾𝗋𝗌𝗂𝗈𝗇   : 1.0
› 𝖲𝗎𝗉𝗉𝗈𝗋𝗍   : [all buyer, ortu] 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⟡ 𝙈𝙀𝙉𝙐 𝙐𝙏𝘼𝙈𝘼 ⟡
▣ /share       ⇢  𝖡𝗋𝗈𝖺𝖽𝖼𝖺𝗌𝗍 𝖥𝗈𝗋𝗐𝖺𝗋𝖽
▣ /autoshare   ⇢  𝖠𝗎𝗍𝗈 𝖡𝗋𝗈𝖺𝖽𝖼𝖺𝗌𝗍 𝖥𝗈𝗋𝗐𝖺𝗋𝖽
▣ /pinggrub    ⇢  𝖳𝗈𝗍𝖺𝗅 𝖦𝗋𝗈𝗎𝗉
▣ /bcuser      ⇢  𝖡𝗋𝗈𝖺𝖽𝖼𝖺𝗌𝗍 𝖴𝗌𝖾𝗋 𝖥𝗈𝗋𝗐𝖺𝗋𝖽
▣ /top         ⇢  𝖱𝖺𝗇𝗄𝗂𝗇𝗀 𝖯𝖾𝗇𝗀𝗎𝗇𝖽𝖺𝗇𝗀
▣ /set         ⇢  𝖲𝗂𝗆𝗉𝖺𝗇 𝖳𝖷𝖳 → 𝖩𝖲𝖮𝖭
▣ /del         ⇢  𝖧𝖺𝗉𝗎𝗌 𝖳𝖷𝖳 𝖽𝖺𝗋𝗂 𝖩𝖲𝖮𝖭
▣ /list        ⇢  𝖣𝖺𝖿𝗍𝖺𝗋 𝖳𝖷𝖳 𝖽𝖺𝗅𝖺𝗆 𝖩𝖲𝖮𝖭
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          『🦋』 𝘼𝙡𝙡 𝙃𝙚𝙥𝙥𝙮
</blockquote>`;

    await editMenu(ctx, caption, buttons);
  } catch (error) {
    console.error('Error in Daxingnot1 action:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Action fathirofsc2
bot.action('fathirofsc2', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 BACK', 'startback')],
    ]);

    const caption = `<blockquote>
╭──( 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗧𝗢 )──╮
╰──( 𝗕𝗢𝗧  𝗝𝗔𝗦𝗦𝗘𝗕 𝗩𝟭  )──╯

╭─────( 𝗗𝗔𝗙𝗧𝗔𝗥  )──────╮
│✧ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿 : 𝖥𝖠𝖳𝖧𝖨𝖱 𝖲𝖳𝖧𝖮𝖱𝖤
│✧ 𝗔𝘂𝘁𝗵𝗼𝗿 : Daxyinz
│✧ 𝗩𝗲𝗿𝘀𝗶𝗼𝗇 : 𝟣.𝟢
│✧ 𝗲𝗻𝗰𝗼𝘂𝗿𝗮𝗴𝗲𝗿 : [all buyer, ortu] 
│✧ 𝗗𝗲𝘀𝗸𝗿𝗶𝗽𝘀𝗶 : ⤸ 
│✧ Language 𝖩𝖤𝖯𝖠𝖭𝖦  🇯🇵
│✧ /addprem id ( 𝘢𝘥𝘥 𝘭𝘪𝘴𝘵 𝘱𝘳𝘦𝘮𝘪𝘶𝘮 )
│✧ /delprem id ( 𝘥𝘦𝘭𝘦𝘵𝘦 𝘭𝘪𝘴𝘵 𝘱𝘳𝘦𝘮𝘪𝘶𝘮 )
│✧ /auto on/off teks ( 𝘢𝘶𝘵𝘰 𝘬𝘪𝘳𝘪𝘮 1/𝘫𝘢𝘮 )
│✧ /blokir id (𝘬𝘩𝘶𝘣𝘶𝘴 𝘰𝘸𝘯𝘦𝘳 𝘥𝘢𝘯 𝘩𝘢𝘳𝘶𝘴 𝘢𝘥𝘥 𝘰𝘸𝘯𝘦𝘳)
│✧ /unblokir id (𝘬𝘩𝘶𝘴𝘶𝘴 𝘰𝘸𝘯𝘦𝘳 𝘥𝘢𝘯 𝘩𝘢𝘳𝘶𝘴 𝘢𝘥𝘥 𝘰𝘸𝘯𝘦𝘳)
╰─────────────────────╯</blockquote>`;

    await editMenu(ctx, caption, buttons);
  } catch (error) {
    console.error('Error in fathirofsc2 action:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Action startback
bot.action('startback', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('𝙈𝙀𝙉𝙐 𝙐𝙏𝘼𝙈𝘼', 'Daxingnot1'),
        Markup.button.callback('𝗞𝗛𝗨𝗦𝗨𝗦 𝗙𝗔𝗧𝗛𝗜𝗥 𝗦𝗧𝗛𝗢𝗥𝗘', 'fathirofsc2'),
      ],
      [
        Markup.button.url('𝘿𝙀𝙑𝙀𝙇𝙊𝙋𝙀𝙍', 'https://t.me/Wikiofficiall'),
      ]
    ]);

    const caption = `<blockquote>
╭──( 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗧𝗢 )──╮
╰──( 𝗕𝗢𝗧  𝗝𝗔𝗦𝗦𝗘𝗕  )──╯

╭─────( 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐒𝐈  )──────╮
│✧ Developer : FATHIR STHORE
│✧ Author : Daxyinz
│✧ Version : 1.0
│✧ Language kode : 𝖩𝖺𝗏𝖺𝖲𝖼𝗋𝗂𝗉𝗍 
│✧ Deskripsi : ⤸ 
│✧ Language 𝖩𝖤𝖯𝖠𝖭𝖦  🇯🇵
│
│<b>このボットは</b>
│<b>ルーム/グループにメッセージを配信するサービス</b>
│<b>ボットです。これにより、</b>
│<b>ユーザーはボット内のすべてのルーム/</b>
│<b>グループにメッセージを素早く共有できます。</b>
│<b>ボットアクセスを</b>
│<b>取得するには、</b>
│<b>ボットをルーム/グループに2回入力すると、自動的</b>
│<b>にプレミアムアクセスが付与されます。</b>
│
│✧Language INDONESIA 🇮🇩
│<b>Bot ini adalah Bot Jasa sebar ke</b>
│     <b>room/grub untuk mempermudah</b> 
│     <b>Pengguna agar cepat membagi pesan</b>
│     <b>Kesemua room/grub yang ada di BOT</b>
│     <b>dan jika anda ingin mendapatkan</b>
│     <b>Akses BOT Masukin BOT Ke</b> 
│     <b>room/grub sebanyak 2x otomatis</b>
│     <b>akan mendapatkan akses premium</b>
╰─────────────────────╯</blockquote>`;
    
    await editMenu(ctx, caption, buttons);
  } catch (error) {
    console.error('Error in startback action:', error);
    ctx.reply('❌ Terjadi kesalahan.');
  }
});

/* ============================================
   KONFIGURASI BOT DAN SERVER
============================================ */

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error untuk ${ctx.updateType}:`, err);
  console.error('Error details:', err.stack);
  
  if (ctx.chat && ctx.chat.id) {
    try {
      ctx.reply('❌ Terjadi kesalahan internal. Silakan coba lagi nanti.');
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
});

// Handle process termination
process.once('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down...');
  bot.stop('SIGINT');
  if (autoShareInterval) clearInterval(autoShareInterval);
  if (autoKirimInterval) clearInterval(autoKirimInterval);
});

process.once('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  bot.stop('SIGTERM');
  if (autoShareInterval) clearInterval(autoShareInterval);
  if (autoKirimInterval) clearInterval(autoKirimInterval);
});

// Launch bot
bot.launch({
  dropPendingUpdates: true,
  allowedUpdates: ['message', 'callback_query', 'chat_member']
}).then(() => {
  console.log('🤖 Bot JASSEB berjalan!');
  console.log('👤 Bot username:', bot.botInfo?.username);
  console.log('🆔 Bot ID:', bot.botInfo?.id);
  
  // Jalankan backup otomatis setiap 6 jam
  setInterval(() => {
    kirimBackup();
  }, 6 * 60 * 60 * 1000);
  
  // Backup pertama setelah 1 menit
  setTimeout(() => {
    kirimBackup();
  }, 60000);
  
}).catch((err) => {
  console.error('Failed to launch bot:', err);
  process.exit(1);
});

// Setup server untuk Vercel
if (process.env.VERCEL) {
  // Export untuk Vercel
  module.exports = app;
} else {
  // Jalankan server lokal
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
  });
}
