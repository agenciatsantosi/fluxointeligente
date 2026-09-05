import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import * as db from '../services/database.js';
import * as auth from '../services/authService.js';

dotenv.config({ path: '.env.local', override: true });

async function populate() {
    console.log('==============================================');
    console.log('🚀 INICIANDO POPULAÇÃO DO BANCO DE DADOS...');
    console.log('📍 Conectando em:', process.env.DATABASE_URL);
    console.log('==============================================');

    try {
        // 1. Inicializa tabelas e seeds de categorias
        console.log('\n[1/3] Criando tabelas e seeds de categorias (Shopee, Mercado Livre)...');
        await db.initializeDatabase();
        console.log('✅ Tabelas e categorias populadas com sucesso!');

        // 2. Migração de limites de plataforma
        console.log('\n[2/3] Migrando tabelas de limites e segurança...');
        await db.migratePlatformLimits();
        console.log('✅ Limites de plataforma configurados com sucesso!');

        // 3. Criação do usuário administrador padrão
        console.log('\n[3/3] Inicializando autenticação e usuário administrador...');
        await auth.initializeAuth();
        console.log('✅ Usuário administrador verificado/criado:');
        console.log('   📧 Email: admin@fluxointeligente.com');
        console.log('   🔑 Senha: admin123');

        console.log('\n🎉 BANCO DE DADOS CONFIGURADO E POPULADO COM SUCESSO!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Erro durante a população do banco de dados:', err);
        process.exit(1);
    }
}

populate();
