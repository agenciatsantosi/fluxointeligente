import fs from 'fs';
import path from 'path';

const profilesDir = path.join(process.cwd(), 'kwai_profiles');
const items = fs.readdirSync(profilesDir);
const folders = items
    .map(item => {
        const itemPath = path.join(profilesDir, item);
        const stat = fs.statSync(itemPath);
        return {
            name: item,
            mtime: stat.mtime
        };
    })
    .sort((a, b) => b.mtime - a.mtime);

console.log("Todas as pastas ordenadas por data de modificação:");
folders.slice(0, 30).forEach(f => {
    console.log(`${f.name} - Modificado em: ${f.mtime.toLocaleString()}`);
});
