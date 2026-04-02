import express from 'express';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';

const app = express();
app.use(express.json());

const PORT = process.env.WA_BRIDGE_PORT || 3001;
const AUTH_DIR = process.env.WA_AUTH_DIR || '/data/wa-auth';
const API_KEY = process.env.WA_API_KEY || 'shavtzak-wa-bridge-key';

// State
let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected'; // disconnected | qr_pending | connected
let connectedNumber = null;

const logger = pino({ level: 'warn' });

// Auth middleware
function authCheck(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function startWhatsApp() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['שבצק', 'Chrome', '120.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      currentQR = qr;
      connectionStatus = 'qr_pending';
      console.log('[WA] New QR code generated');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[WA] Connection closed: ${reason}`);
      
      if (reason === DisconnectReason.loggedOut) {
        // Clear auth and restart
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        connectionStatus = 'disconnected';
        currentQR = null;
        connectedNumber = null;
        console.log('[WA] Logged out, auth cleared');
      } else {
        // Reconnect
        connectionStatus = 'disconnected';
        setTimeout(startWhatsApp, 3000);
      }
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      currentQR = null;
      connectedNumber = sock.user?.id?.split(':')[0] || 'unknown';
      console.log(`[WA] Connected as ${connectedNumber}`);
    }
  });
}

// API Endpoints
app.get('/status', authCheck, (req, res) => {
  res.json({
    status: connectionStatus,
    connected_number: connectedNumber,
    has_qr: !!currentQR,
  });
});

app.get('/qr', authCheck, async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'connected', connected_number: connectedNumber, message: 'כבר מחובר' });
  }
  
  if (!currentQR) {
    // Start connection if not started
    if (connectionStatus === 'disconnected') {
      startWhatsApp();
      // Wait a bit for QR
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!currentQR) {
      return res.json({ status: 'waiting', message: 'ממתין לקוד QR... נסה שוב בעוד כמה שניות' });
    }
  }

  // Return QR as base64 image
  const qrImage = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 });
  res.json({
    status: 'qr_pending',
    qr_image: qrImage,
    qr_data: currentQR,
    message: 'סרוק את קוד ה-QR עם WhatsApp',
    instructions: [
      '1. פתח את WhatsApp בטלפון',
      '2. לחץ על ⋮ > מכשירים מקושרים',
      '3. לחץ על "קשר מכשיר"',
      '4. סרוק את קוד ה-QR',
    ],
  });
});

app.post('/disconnect', authCheck, (req, res) => {
  if (sock) {
    sock.logout();
    connectionStatus = 'disconnected';
    currentQR = null;
    connectedNumber = null;
  }
  res.json({ status: 'disconnected' });
});

app.post('/send', authCheck, async (req, res) => {
  if (connectionStatus !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp לא מחובר' });
  }
  
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message required' });
  }
  
  // Normalize phone: remove +, add @s.whatsapp.net
  const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  
  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', to: jid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`[WA Bridge] Running on port ${PORT}`);
  // Auto-connect if auth exists
  if (fs.existsSync(AUTH_DIR + '/creds.json')) {
    console.log('[WA] Found existing auth, reconnecting...');
    startWhatsApp();
  }
});
