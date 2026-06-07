const sharp = require('sharp');
const axios = require("axios");
const express = require("express");
const app = express();

app.get("/convertTo32", async (req, res) => {
    try {
        let response = await axios({
            url: req.query.url,
            responseType: 'arraybuffer'
        });

        const screenW = parseInt(req.query.screenW || "1024");
        const screenH = parseInt(req.query.screenH || "768");
        const MAX = 1024;

        const rawResult = await sharp(response.data)
            .resize(Math.min(screenW, MAX), Math.min(screenH, MAX), {
                fit: 'inside',
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3  // ✅ algorithm คมสุด
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const rawData = rawResult.data;
        const rgbArray = [];
        const alphaArray = [];

        for (let i = 0; i < rawData.length; i += 4) {
            rgbArray.push(rawData[i], rawData[i + 1], rawData[i + 2]);
            alphaArray.push(rawData[i + 3] < 10 ? 0 : 1);
        }

        res.json({
            data: { data: rgbArray },
            alpha: alphaArray,
            info: {
                width: rawResult.info.width,
                height: rawResult.info.height,
                channels: 3
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));