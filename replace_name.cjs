const fs = require('fs');
const path = require('path');

const dirsToProcess = [
    'components',
    'pages',
    'services',
    '.', // root for server.js, package.json
];

const fileExtensions = ['.js', '.ts', '.tsx', '.json', '.md', '.txt'];
const ignoreFiles = ['package-lock.json', 'node_modules', '.git', 'replace_name.cjs', 'fix_encoding.cjs', 'fix_encoding.js'];

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (ignoreFiles.includes(file)) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (dir !== '.') { // don't recurse into root indefinitely
                processDir(fullPath);
            }
        } else {
            const ext = path.extname(file);
            if (fileExtensions.includes(ext) || file === 'server.js') {
                let content = fs.readFileSync(fullPath, 'utf8');
                let newContent = content
                    .replace(/MeliFlow/g, 'FluxoInteligente')
                    .replace(/meliflow/g, 'fluxointeligente')
                    .replace(/MELIFLOW/g, 'FLUXOINTELIGENTE');
                
                if (content !== newContent) {
                    fs.writeFileSync(fullPath, newContent, 'utf8');
                    console.log('Replaced in:', fullPath);
                }
            }
        }
    }
}

for (const dir of dirsToProcess) {
    processDir(path.join(__dirname, dir));
}
console.log('Done replacing MeliFlow with FluxoInteligente.');
