const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

console.log('=== PRODUTOS NO BANCO ===\n');

db.all('SELECT id, name, price, stock, (price * stock) as total FROM products', (err, rows) => {
    if (err) {
        console.error('Erro:', err);
        db.close();
        return;
    }

    console.log(`Total de produtos: ${rows.length}\n`);

    let totalValue = 0;
    rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.name}`);
        console.log(`   Preço: R$ ${row.price.toFixed(2)} | Estoque: ${row.stock} | Total: R$ ${row.total.toFixed(2)}`);
        totalValue += row.total;
    });

    console.log(`\n=== VALOR TOTAL EM ESTOQUE: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ===`);

    db.close();
});
