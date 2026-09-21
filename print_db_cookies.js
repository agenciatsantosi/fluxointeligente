import pg from 'pg';

(async () => {
    const pool = new pg.Pool({
        connectionString: 'postgres://postgres:d50546e1b4128c0a07be@31.97.164.76:5433/meliflow?sslmode=disable'
    });

    try {
        const res = await pool.query('SELECT cookies FROM kwai_accounts WHERE id = 339');
        if (res.rows.length === 0) {
            console.log('Account 339 not found');
            process.exit(1);
        }

        const cookiesStr = res.rows[0].cookies;
        const dbCookies = JSON.parse(cookiesStr);
        
        console.log(`Account 339 DB cookies (${dbCookies.length}):`);
        for (const c of dbCookies) {
            console.log(`- ${c.name} (domain: ${c.domain}, session: ${c.session})`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
})();
