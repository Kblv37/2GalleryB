import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "megajs";

const app = express();
app.use(cors());
app.use(express.json());

// Хранение файлов в памяти (не во временной папке)
const upload = multer({ storage: multer.memoryStorage() });

// 📌 Маршрут загрузки фото
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не передан" });
    }

    console.log("📥 Получен файл:", file.originalname, "размер:", file.size);

    // Подключаемся к MEGA
    const storage = new Storage({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD,
    });

    await new Promise((resolve, reject) => {
      storage.on("ready", resolve);
      storage.on("error", reject);
    });

    // ✅ Передаём размер и включаем буферизацию
    const megaFile = storage.upload(file.originalname, {
      size: file.size,
      allowUploadBuffering: true,
    });

    megaFile.end(file.buffer);

    megaFile.on("complete", (uploadedFile) => {
      uploadedFile.link((err, link) => {
        if (err) {
          console.error("❌ Ошибка создания ссылки:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("✅ Файл загружен! Ссылка:", link);
        res.json({ url: link });
      });
    });

  } catch (err) {
    console.error("🔥 Ошибка сервера:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Запуск сервера
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
ы