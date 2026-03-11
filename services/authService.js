import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    getUserByEmail,
    createUser,
    getAllUsers as dbGetAllUsers,
    updateUserRole as dbUpdateUserRole,
    updateUserSubscription as dbUpdateUserSubscription,
    addPayment as dbAddPayment,
    getSubscriptionStats as dbGetSubscriptionStats
} from './database.js';

// In-memory sessions (backed by file for persistence)
const sessions = new Map();
const sessionsFile = path.resolve('data', 'sessions.json');

// Helper to save sessions to file
function saveSessions() {
    try {
        const data = Array.from(sessions.entries());
        // Ensure data directory exists
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data', { recursive: true });
        }
        fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving sessions:', error);
    }
}

// Helper to load sessions from file
function loadSessions() {
    try {
        if (fs.existsSync(sessionsFile)) {
            const content = fs.readFileSync(sessionsFile, 'utf8');
            const data = JSON.parse(content);
            data.forEach(([token, sessionData]) => {
                sessions.set(token, sessionData);
            });
            console.log(`✅ Loaded ${sessions.size} sessions from disk`);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

/**
 * Initialize users table and create default admin
 */
export async function initializeAuth() {
    try {
        // Load persisted sessions
        loadSessions();

        // Create default admin user if not exists
        const defaultEmail = 'admin@meliflow.com';
        const defaultPassword = 'admin123'; // Change this in production!

        const existingUser = await getUserByEmail(defaultEmail);

        if (!existingUser) {
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            await createUser(defaultEmail, hashedPassword, 'Administrador');

            // Update role to admin
            const newestUser = await getUserByEmail(defaultEmail);
            await dbUpdateUserRole(newestUser.id, 'admin');

            console.log('✅ Default user created: admin@meliflow.com / admin123');
        }
    } catch (error) {
        console.error('Error initializing auth:', error);
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
        const existingUser = await getUserByEmail(email);

        if (existingUser) {
            throw new Error('Email já cadastrado');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const user = await createUser(email, hashedPassword, name || email.split('@')[0]);

        return {
            success: true,
            userId: user.id,
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
        const user = await getUserByEmail(email);

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
            role: user.role || 'user', // Include role in session
            createdAt: Date.now()
        };

        sessions.set(token, sessionData);
        saveSessions();

        return {
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role || 'user' // Include role in response
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
        saveSessions();
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

    // Check if session is older than 30 days
    const sessionAge = Date.now() - session.createdAt;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (sessionAge > maxAge) {
        sessions.delete(token);
        saveSessions();
        return { success: false, error: 'Sessão expirada' };
    }

    return {
        success: true,
        user: {
            userId: session.userId,
            email: session.email,
            name: session.name,
            role: session.role || 'user' // Include role in verification
        }
    };
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
    return await dbGetAllUsers();
}

/**
 * Get subscription statistics
 */
export async function getSubscriptionStats() {
    return await dbGetSubscriptionStats();
}

/**
 * Update user subscription
 */
export async function updateUserSubscription(userId, plan, status, endDate) {
    return await dbUpdateUserSubscription(userId, plan, status, endDate);
}

/**
 * Add payment for user
 */
export async function addPayment(userId, amount, method, status) {
    return await dbAddPayment(userId, amount, method, status);
}

/**
 * Middleware to protect routes
 */
export function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verification = verifyToken(token);

    if (!verification.success) {
        console.log(`[DEBUG AUTH] Auth failed for ${req.method} ${req.url}: ${verification.error}`);
        return res.status(401).json(verification);
    }

    req.user = verification.user;
    next();
}

/**
 * Middleware to protect admin routes
 */
/**
 * Delete user
 */
export async function deleteUser(userId) {
    try {
        await db.deleteUser(userId);
        return { success: true, message: 'Usuário excluído com sucesso' };
    } catch (error) {
        console.error('[AUTH] Error deleting user:', error);
        throw error;
    }
}

export function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const verification = verifyToken(token);

    if (!verification.success) {
        return res.status(401).json(verification);
    }

    const user = verification.user;

    // Check if user is admin
    if (user.role !== 'admin' && user.email !== 'admin@meliflow.com') {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado: Requer privilégios de administrador'
        });
    }

    req.user = user;
    next();
}

export default {
    initializeAuth,
    registerUser,
    loginUser,
    logoutUser,
    verifyToken,
    requireAuth,
    requireAdmin,
    getSubscriptionStats,
    updateUserSubscription,
    addPayment,
    deleteUser
};
