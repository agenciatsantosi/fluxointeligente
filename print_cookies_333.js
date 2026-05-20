import pg from 'pg';

const pool = new pg.Pool({
    connectionString: "postgres://postgres:d50546e1b4128c0a07be@31.97.164.76:5433/meliflow?sslmode=disable"
});

async function run() {
    try {
        const res = await pool.query("SELECT id, username, cookies, added_at FROM kwai_accounts WHERE id = 333");
        if (res.rows[0]) {
            console.log("Account 333 Username:", res.rows[0].username);
            console.log("Added at:", res.rows[0].added_at);
            const cookies = JSON.parse(res.rows[0].cookies);
            console.log("Cookies list length:", cookies.length);
            cookies.forEach(c => {
                console.log(`- Domain: ${c.domain}, Name: ${c.name}, Value snippet: ${c.value.substring(0, 15)}...`);
            });
        } else {
            console.log("Account not found");
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}

run();
