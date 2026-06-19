const sharp = require('sharp');
const axios = require("axios");
const express = require("express");
const { GifUtil } = require('gifwrap');
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
    const MAX_FRAMES = 30;
    const gif = await GifUtil.read(Buffer.from(buffer));
    const frames = [];

    // ✅ คำนวณขนาดจริงที่จะ resize ก่อน
    const scale = Math.min(screenW / gif.width, screenH / gif.height);
    const targetW = Math.floor(gif.width * scale);
    const targetH = Math.floor(gif.height * scale);

    for (const frame of gif.frames.slice(0, MAX_FRAMES)) {
        const rawResult = await sharp(frame.bitmap.data, {
            raw: {
                width: frame.bitmap.width,
                height: frame.bitmap.height,
                channels: 4
            }
        })
            .resize(targetW, targetH)  // ✅ resize ให้พอดีหน้าจอเลย
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const rgbArray = [];
        const alphaArray = [];

        for (let i = 0; i < rawResult.data.length; i += 4) {
            rgbArray.push(rawResult.data[i], rawResult.data[i + 1], rawResult.data[i + 2]);
            alphaArray.push(rawResult.data[i + 3] < 10 ? 0 : 1);
        }

        frames.push({
            data: rgbArray,
            alpha: alphaArray,
            delay: frame.delayCentisecs * 10
        });
    }

    return {
        type: 'gif',
        frames: frames,
        info: {
            width: targetW,   // ✅ ส่งขนาดจริงที่ resize แล้ว
            height: targetH,
            frameCount: frames.length
        }
    };
}

// ✅ endpoint เดียว รองรับทั้ง Image และ GIF
app.get("/convert", async (req, res) => {
    try {
        const url = req.query.url;
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
            url,
            responseType: 'arraybuffer',
            maxContentLength: 10 * 1024 * 1024,
            timeout: 15000
        });

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
        if (err.code === 'ECONNABORTED') {
            return res.status(408).json({ error: "Timeout" });
        }
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));