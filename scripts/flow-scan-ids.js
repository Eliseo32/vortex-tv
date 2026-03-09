/**
 * flow-scan-ids.js — Escanea rangos de IDs en la API de Flow Argentina
 * para descubrir los contentIds válidos de los canales de TV en vivo.
 * Uso: node scripts/flow-scan-ids.js
 */

import https from 'https';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjdXN0b21lcklkIjoiMzMxOTEyIiwiZXhwIjoxNzczMDkzNTU5LCJhY2NvdW50SWQiOiIzMjUwNzEiLCJyZWdpb25JZCI6IjIyIiwiZGV2aWNlIjp7ImRldmljZUlkIjoiODg3NTE3NDQiLCJkZXZpY2VUeXBlIjoiY2xvdWRfY2xpZW50IiwiaXBBZGRyZXNzIjoiIiwiZGV2aWNlTmFtZSI6IldFQihXaW4zMikiLCJtYWNBZGRyZXNzIjoiNTg5NTE3OTU4MjdCIiwic2VyaWFsTnVtYmVyIjoiIiwic3RhdHVzIjoiQSIsInV1aWQiOiI1ODk1MTc5NTgyN0JBMTdFODlERjY5OUFGRUJFRjU5MyJ9LCJkZXZpY2VUYWdzIjpbXX0.hIXMe-rgrdFyT_KkvM0UYRmuxKV2cbtlGD5M0dHNm3U';
const DIT = 'uundb58UgCDIyoSrxuMz2KUegdEYWoiQA/Wc2YMJtgFMXl8EynzavSFrRSf/s9TX/wPw/UPWXlF+vnnDQ/kKAy0y2LWvX7xVgmnioVInxFQ=';
const SES = 'CDogZQDilx5/e2eDT622apRUwf6y62qufnQnW6kPJSXkq8YgvJ2pUE2kBgyW0BfpOey6aa6+PV66la6LdBw6BK6q0s7QIiAST70t8yIrGN9oBQjNd9CSIh10Y037zquo+pg7jrJ8rzGmVIPcuFs7QOXDBCTyEOob+NIDrFhQKm+ZvpBlgpUZp94RVyJ+bcJA01lZRX0qfT/r66Idg7Swpj/ZlGPhn24oN4FEJ0wKk8FB4H76X2wKupLLDTInA4PHn/Tq8SioTZ2xhIvdH+Hj6/2lV6nps7tmTC8Wg1qd9PFRN1SCtne5hoxw7XAwPA8FPL43Ut2UUoH7MKRl8xv7MDe5E/SwqWU5Aq0nEi3JNONjVl0hUMnZO4PYHV5nXW2R';
const SS = 'vJSs9LwHcQiZz5tzXxwb9drmTc7Xosj5alaboD5jB5R3lD5ibUFNIx4oqVPBvdOffXLxokTv00UmIYA671TDYxVGqkd12hQRVPAIFpSA+dvxxszZHxSz8wSVLRocGSga3DJvQPFELbNByUZkxZcCZA==';

const PARALLEL = 10;
const found = [];

function probe(id) {
    return new Promise(resolve => {
        const path = `/policy_manager/v4/content_source/TV_CHANNEL/?contentId=${id}` +
            `&serviceSessionId=${encodeURIComponent(SS)}&deviceInfoToken=${encodeURIComponent(DIT)}`;
        const req = https.request({
            hostname: 'vipprm.cvattv.com.ar', port: 9060, path, method: 'GET',
            rejectUnauthorized: false, timeout: 8000,
            headers: { 'Authorization': `Bearer ${TOKEN}`, 'mn-customer': '1', 'mn-prm-session': SES, 'Accept': 'application/json' }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const body = JSON.parse(d);
                    const r = body.playback_resources?.[0];
                    if (r?.contentUrl) {
                        const urlParts = r.contentUrl.split('/');
                        const name = urlParts[urlParts.length - 2] || String(id);
                        const entry = { id: String(id), name, mpd: r.contentUrl };
                        found.push(entry);
                        console.log(`  ✅ ${String(id).padStart(8)} → ${name}`);
                    }
                } catch { }
                resolve();
            });
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.end();
    });
}

async function scanRange(start, end, label) {
    console.log(`\n[Scan] ${label}: ${start} → ${end}`);
    const ids = [];
    for (let i = start; i <= end; i++) ids.push(i);
    for (let i = 0; i < ids.length; i += PARALLEL) {
        await Promise.all(ids.slice(i, i + PARALLEL).map(probe));
    }
}

async function main() {
    console.log('Flow Argentina — Channel ID Scanner');
    console.log('=====================================');

    // Known working: 6637, 10017 → suggests IDs in the 1000-20000 range
    // Scan strategically:
    await scanRange(1000, 2000, 'Range 1000-2000');
    await scanRange(2000, 3000, 'Range 2000-3000');
    await scanRange(3000, 4000, 'Range 3000-4000');
    await scanRange(4000, 5000, 'Range 4000-5000');
    await scanRange(5000, 7000, 'Range 5000-7000 (contains 6637)');
    await scanRange(7000, 9000, 'Range 7000-9000');
    await scanRange(9000, 12000, 'Range 9000-12000 (contains 10017)');
    await scanRange(12000, 15000, 'Range 12000-15000');
    await scanRange(15000, 20000, 'Range 15000-20000');
    await scanRange(20000, 25000, 'Range 20000-25000');

    console.log(`\n\n══ FOUND ${found.length} CHANNELS ══`);
    found.forEach(c => console.log(`  { id: '${c.id}', name: '${c.name}' },`));

    const outPath = join(__dirname, '../m3u/flow_channel_ids.json');
    writeFileSync(outPath, JSON.stringify(found, null, 2));
    console.log(`\nSaved to: m3u/flow_channel_ids.json`);
}

main().catch(e => console.error('Fatal:', e.message));
