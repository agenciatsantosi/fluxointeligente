import fs from 'fs';

const content = fs.readFileSync('c:\\Users\\Thiago Santosi\\Desktop\\Projetos\\Auto_postagem\\server.js', 'utf8');
const lines = content.split('\n');

const start = 1159;
const end = 1260;

for (let i = start; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
}
