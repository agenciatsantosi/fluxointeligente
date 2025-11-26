import bcrypt from 'bcrypt';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'meliflow.db');
const db = new Database(dbPath);

// In-memory sessions (for simplicity, use Redis in production)
const sessions = new Map();

/**
 * Initialize users table
 */
export function initializeAuth() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create default admin user if not exists
    const defaultEmail = 'admin@meliflow.com';
    const defaultPassword = 'admin123'; // Change this in production!

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(defaultEmail);

    if (!existingUser) {
        const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
        db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(
            defaultEmail,
            hashedPassword,
            'Administrador'
        );
        console.log('✅ Default user created: admin@meliflow.com / admin123');
    }
}

/**
 * Register a new user
 */
export async function registerUser(email, password, name) {
    try {
        // Validate email
        if (!email || !email.includes('@')) {
            throw new Error('Email inválido');
        }

        // Validate password
        if (!password || password.length < 6) {
            throw new Error('Senha deve ter no mínimo 6 caracteres');
        }

        // Check if user already exists
        const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (existingUser) {
            throw new Error('Email já cadastrado');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(
            email,
            hashedPassword,
            name || email.split('@')[0]
        );

        return {
            success: true,
            userId: result.lastInsertRowid,
            message: 'Usuário criado com sucesso'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Login user
 */
export async function loginUser(email, password) {
    try {
        // Validate inputs
        if (!email || !password) {
            throw new Error('Email e senha são obrigatórios');
        }

        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            throw new Error('Email ou senha incorretos');
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            throw new Error('Email ou senha incorretos');
        }

        // Generate session token
        const token = crypto.randomBytes(32).toString('hex');
        const sessionData = {
            userId: user.id,
            email: user.email,
            name: user.name,
            createdAt: Date.now()
        };

        sessions.set(token, sessionData);

        return {
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Logout user
 */
export function logoutUser(token) {
    if (sessions.has(token)) {
        sessions.delete(token);
        return { success: true, message: 'Logout realizado com sucesso' };
    }
    return { success: false, error: 'Sessão não encontrada' };
}

/**
 * Verify session token
 */
export function verifyToken(token) {
    if (!token) {
        return { success: false, error: 'Token não fornecido' };
    }

    const session = sessions.get(token);
    if (!session) {
        return { success: false, error: 'Sessão inválida ou expirada' };
    }

    // Check if session is older than 24 hours
    const sessionAge = Date.now() - session.createdAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (sessionAge > maxAge) {
        sessions.delete(token);
        return { success: false, error: 'Sessão expirada' };
    }

    return {
        success: true,
        user: {
            userId: session.userId,
            email: session.email,
            name: session.name
        }
    };
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
    const users = db.prepare('SELECT id, email, name, created_at FROM users').all();
    return users;
}

/**
 * Middleware to protect routes
 */
export function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verification = verifyToken(token);

    if (!verification.success) {
        return res.status(401).json(verification);
    }

    req.user = verification.user;
    next();
}

export default {
    initializeAuth,
    registerUser,
    loginUser,
    logoutUser,
    verifyToken,
    getAllUsers,
    requireAuth
};
