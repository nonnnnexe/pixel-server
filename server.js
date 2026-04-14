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

        const SIZE = parseInt(req.query.size || "100");
        const bg = { r: 0, g: 0, b: 0 };

        // ✅ ดึง raw ก่อน flatten เพื่อรู้ว่า pixel ไหน transparent
        const rawResult = await sharp(response.data)
            .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const rawData = rawResult.data;
        const width = rawResult.info.width;
        const height = rawResult.info.height;

        // ✅ สร้าง alpha mask และ RGB array
        const rgbArray = [];
        const alphaArray = [];

        for (let i = 0; i < rawData.length; i += 4) {
            rgbArray.push(rawData[i], rawData[i + 1], rawData[i + 2]);
            alphaArray.push(rawData[i + 3] < 10 ? 0 : 1); // 0 = transparent, 1 = visible
        }

        res.json({
            data: { data: rgbArray },
            alpha: alphaArray,  // ✅ ส่ง alpha mask มาด้วย
            info: { width, height, channels: 3 }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));