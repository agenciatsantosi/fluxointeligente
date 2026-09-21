import fs from 'fs';

const content = fs.readFileSync('c:\\Users\\Thiago Santosi\\Desktop\\Projetos\\Auto_postagem\\server.js', 'utf8');
const lines = content.split('\n');

console.log("Total lines:", lines.length);

for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('kwai')) {
        console.log(`${i + 1}: ${lines[i].trim()}`);
    }
}
