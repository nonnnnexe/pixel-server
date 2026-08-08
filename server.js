const sharp = require('sharp');
const axios = require("axios");
const express = require("express");
const app = express();

const cache = new Map();
const CACHE_LIMIT = 50;
const CACHE_TTL = 60 * 60 * 1000;

function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    if (cache.size >= CACHE_LIMIT) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ✅ ตรวจสอบว่าเป็น GIF หรือ Image จาก URL + Content-Type
async function detectType(url, buffer) {
    // เช็คจาก URL ก่อน
    if (url.toLowerCase().includes('.gif')) return 'gif';

    // เช็คจาก magic bytes ของไฟล์
    const hex = buffer.slice(0, 6).toString('hex');
    if (hex.startsWith('474946')) return 'gif'; // GIF89a หรือ GIF87a
    return 'image';
}

async function processImage(buffer, screenW, screenH) {
    const MAX = 1024;
    const rawResult = await sharp(buffer)
        .resize(Math.min(screenW, MAX), Math.min(screenH, MAX), {
            fit: 'inside',
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const rgbArray = [];
    const alphaArray = [];

    for (let i = 0; i < rawResult.data.length; i += 4) {
        rgbArray.push(rawResult.data[i], rawResult.data[i + 1], rawResult.data[i + 2]);
        alphaArray.push(rawResult.data[i + 3] < 10 ? 0 : 1);
    }

    return {
        type: 'image',
        data: { data: rgbArray },
        alpha: alphaArray,
        info: {
            width: rawResult.info.width,
            height: rawResult.info.height,
            channels: 3
        }
    };
}

async function processGif(buffer, screenW, screenH) {
    const MAX_FRAMES = 30
    const MAX_SIZE = 200

    const scale = Math.min(
        Math.min(screenW, MAX_SIZE) / 100,
        Math.min(screenH, MAX_SIZE) / 100
    )

    // ✅ ใช้ sharp แยก frames จาก GIF
    const metadata = await sharp(buffer, { animated: true }).metadata()
    const frameCount = Math.min(metadata.pages || 1, MAX_FRAMES)
    const delay = metadata.delay || []

    const frames = []

    for (let i = 0; i < frameCount; i++) {
        const rawResult = await sharp(buffer, { animated: false, page: i })
            .resize(
                Math.min(screenW, MAX_SIZE),
                Math.min(screenH, MAX_SIZE),
                { fit: 'inside', kernel: 'lanczos3' }
            )
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })

        const rgbArray = []
        const alphaArray = []

        for (let j = 0; j < rawResult.data.length; j += 4) {
            rgbArray.push(rawResult.data[j], rawResult.data[j + 1], rawResult.data[j + 2])
            alphaArray.push(rawResult.data[j + 3] < 10 ? 0 : 1)
        }

        frames.push({
            data: rgbArray,
            alpha: alphaArray,
            delay: delay[i] || 100
        })
    }

    return {
        type: 'gif',
        frames,
        info: {
            width: frames[0] ? Math.min(screenW, MAX_SIZE) : 0,
            height: frames[0] ? Math.min(screenH, MAX_SIZE) : 0,
            frameCount: frames.length
        }
    }
}

// ✅ endpoint เดียว รองรับทั้ง Image และ GIF
app.get("/convert", async (req, res) => {
    try {
        const url = req.query.url;
        console.log("URL received:", url)  // ✅ เพิ่มบรรทัดนี้
        const screenW = parseInt(req.query.screenW || "1024");
        const screenH = parseInt(req.query.screenH || "768");
        const size = parseInt(req.query.size || "64");
        const cacheKey = `${url}_${screenW}_${screenH}`;

        const cached = getCache(cacheKey);
        if (cached) {
            console.log("✅ Cache hit:", url);
            return res.json(cached);
        }

        const response = await axios({
            url: url,
            responseType: 'arraybuffer',
            maxContentLength: 10 * 1024 * 1024,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })

        const buffer = Buffer.from(response.data);
        const type = await detectType(url, buffer);

        let result;
        if (type === 'gif') {
            result = await processGif(buffer, screenW, screenH);  // ✅ ส่ง screenW/H
        } else {
            result = await processImage(buffer, screenW, screenH);
        }

        setCache(cacheKey, result);
        res.json(result);

    } catch (err) {
        console.error("❌ Error:", err.message)  // ✅ เพิ่มบรรทัดนี้
        if (err.code === 'ECONNABORTED') {
            return res.status(408).json({ error: "Timeout" })
        }
        res.status(500).json({ error: err.message })
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));