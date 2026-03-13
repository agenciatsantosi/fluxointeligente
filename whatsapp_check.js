
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, 'data', 'whatsapp-test-session');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function start() {
    console.log('--- WHATSAPP DIAGNOSTIC START ---');
    console.log('Session Dir:', sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA version v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state,
        browser: ['FluxoInteligente', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR CODE RECEIVED!');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode
                : 0;

            console.log('Connection closed. Status:', statusCode);
            console.log('Error detail:', lastDisconnect?.error);

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Attempting to reconnect...');
                start();
            } else {
                console.log('Logged out.');
            }
        } else if (connection === 'open') {
            console.log('Connected!');
        }
    });
}

start().catch(err => {
    console.error('CRITICAL ERROR:', err);
});
