import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "megajs";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не передан" });
    }

    const size = file.buffer.length;
    console.log("📥 Получен файл:", file.originalname, "размер:", size);

    const storage = new Storage({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD,
      allowUploadBuffering: true // <-- 📌 ВКЛЮЧИЛ ЗДЕСЬ
    });

    await new Promise((resolve, reject) => {
      storage.on("ready", resolve);
      storage.on("error", reject);
    });

    const megaFile = storage.upload(file.originalname, { size });
    megaFile.end(file.buffer);

    megaFile.on("complete", (uploadedFile) => {
      uploadedFile.link((err, link) => {
        if (err) {
          console.error("❌ Ошибка ссылки:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("✅ Загружено. Ссылка:", link);
        res.json({ url: link });
      });
    });

  } catch (err) {
    console.error("🔥 Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
