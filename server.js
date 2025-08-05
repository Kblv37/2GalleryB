// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";

const app = express();
const PORT = process.env.PORT || 10000;

// Настройка Cloudinary через переменные окружения
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer для работы с файлами
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// Тестовый маршрут
app.get("/", (req, res) => {
  res.send("✅ Server работает с Cloudinary");
});

// Загрузка фото
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не найден" });
    }

    // Загрузка в Cloudinary
    const result = await cloudinary.uploader.upload_stream(
      {
        folder: "Photos-port", // папка в Cloudinary
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("Ошибка Cloudinary:", error);
          return res.status(500).json({ error: error.message });
        }
        res.json({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    // pipe данных в upload_stream
    const stream = result;
    stream.end(req.file.buffer);

  } catch (err) {
    console.error("Ошибка загрузки:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Удаление фото по public_id
app.delete("/delete/:public_id", async (req, res) => {
  try {
    const { public_id } = req.params;
    const result = await cloudinary.uploader.destroy(public_id);
    res.json({ result });
  } catch (err) {
    console.error("Ошибка удаления:", err);
    res.status(500).json({ error: "Ошибка при удалении" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server запущен на порту ${PORT}`);
});
