import fs from 'fs';
import axios from 'axios';

async function search() {
    try {
        const response = await axios.get('https://www.instagram.com/p/DYfh320lRQM/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
        });
        const html = response.data;
        
        let cap = null;
        const capIdx = html.indexOf('"caption":{');
        if (capIdx !== -1) {
            const start = capIdx;
            let brackets = 0;
            let end = -1;
            for(let i=start+9; i<html.length; i++) {
                if(html[i]==='{') brackets++;
                else if (html[i]==='}') {
                    brackets--;
                    if(brackets===0) { end = i; break; }
                }
            }
            if (end !== -1) {
                const jsonStr = html.substring(start + 10, end + 1);
                try {
                    const obj = JSON.parse(jsonStr);
                    console.log("Caption text:", obj.text);
                } catch(e) {
                    console.log("Parse error:", e.message);
                }
            }
        } else {
            console.log("No caption found");
        }
    } catch(e) {
        console.log(e.message);
    }
}

search();
