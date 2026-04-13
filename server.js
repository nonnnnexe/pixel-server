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

        const SIZE = 100;
        const bg = { r: 0, g: 0, b: 0 }; // สี background

        let result = await sharp(response.data)
            .resize(SIZE, SIZE, {
                fit: 'contain',        // ✅ รักษา aspect ratio + เติมขอบ
                background: bg         // ✅ สีพื้นหลังตรงขอบ
            })
            .flatten({ background: bg })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        res.json({
            data: { data: Array.from(result.data) },
            info: result.info
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));