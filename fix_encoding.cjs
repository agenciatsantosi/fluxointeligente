const fs = require('fs');
const path = require('path');

function fixEncodingError(str) {
    const map = {
        'Ã¡': 'á', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä', 'Ã¥': 'å',
        'Ã©': 'é', 'Ãª': 'ê', 'Ã«': 'ë',
        'Ã­': 'í', 'Ã®': 'î', 'Ã¯': 'ï',
        'Ã³': 'ó', 'Ã´': 'ô', 'Ãµ': 'õ', 'Ã¶': 'ö',
        'Ãº': 'ú', 'Ã»': 'û', 'Ã¼': 'ü',
        'Ã§': 'ç', 'Ã±': 'ñ', 'Ã½': 'ý',
        'Ã€': 'À', 'Ã ': 'Á', 'Ã‚': 'Â', 'Ãƒ': 'Ã', 'Ã„': 'Ä', 'Ã…': 'Å',
        'Ã‡': 'Ç', 'Ãˆ': 'È', 'Ã‰': 'É', 'ÃŠ': 'Ê', 'Ã‹': 'Ë',
        'ÃŒ': 'Ì', 'Ã ': 'Í', 'ÃŽ': 'Î', 'Ã ': 'Ï',
        'Ã‘': 'Ñ', 'Ã’': 'Ò', 'Ã“': 'Ó', 'Ã”': 'Ô', 'Ã•': 'Õ', 'Ã–': 'Ö',
        'Ã™': 'Ù', 'Ãš': 'Ú', 'Ã›': 'Û', 'Ãœ': 'Ü', 'Ã ': 'Ý'
    };
    let result = str;
    for (const [bad, good] of Object.entries(map)) {
        result = result.split(bad).join(good);
    }
    return result;
}

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let newContent = fixEncodingError(content);
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log('Fixed:', fullPath);
            }
        }
    }
}

processDir('C:/Users/Thiago Santosi/Desktop/Projetos/Auto_postagem/pages');
processDir('C:/Users/Thiago Santosi/Desktop/Projetos/Auto_postagem/components');
console.log('Done.');
