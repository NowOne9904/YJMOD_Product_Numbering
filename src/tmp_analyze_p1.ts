import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('src/tmp_page1.html', 'utf-8');
const $ = cheerio.load(html);

console.log("--- Items on Page 1 ---");
const seen = new Set();
$('a[href*="it_id="]').each((i, el) => {
    const itId = $(el).attr('href')?.match(/it_id=(\d+)/)?.[1];
    if (itId && !seen.has(itId)) {
        seen.add(itId);
        const text = $(el).closest('td, .nList_Cell, .it_box').text().trim().replace(/\s+/g, ' ');
        console.log(`[ID ${itId}] "${text.substring(0, 150)}"`);
    }
});
