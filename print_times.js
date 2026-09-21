import fs from 'fs';
import path from 'path';

const profilesDir = path.join(process.cwd(), 'kwai_profiles');
const items = fs.readdirSync(profilesDir);
const tempFolders = items
    .filter(item => item.startsWith('temp_'))
    .map(item => {
        const itemPath = path.join(profilesDir, item);
        const stat = fs.statSync(itemPath);
        return {
            name: item,
            mtime: stat.mtime
        };
    })
    .sort((a, b) => b.mtime - a.mtime);

console.log("Pastas temporárias ordenadas por data de modificação:");
tempFolders.slice(0, 15).forEach(f => {
    console.log(`${f.name} - Modificado em: ${f.mtime.toLocaleString()}`);
});
