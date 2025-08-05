import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "megajs";

const app = express();
app.use(cors());
app.use(express.json());

// Храним файлы в памяти перед отправкой
const upload = multer({ storage: multer.memoryStorage() });

// Создаём подключение к MEGA
function createStorage() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD,
    });

    storage.on("ready", () => resolve(storage));
    storage.on("error", reject);
  });
}

// Загрузка файла
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не передан" });
    }

    console.log("📥 Получен файл:", file.originalname);

    const storage = await createStorage();

    // ищем или создаём папку Photos-port
    let folder = storage.root.children.find(
      (c) => c.name === "Photos-port" && c.directory
    );
    if (!folder) {
      folder = storage.root.mkdir("Photos-port");
    }

    // загружаем файл в папку
    const megaFile = folder.upload(file.originalname, {
      allowUploadBuffering: true,
      size: file.buffer.length,
    });

    megaFile.end(file.buffer);

    megaFile.on("complete", (uploadedFile) => {
      uploadedFile.link((err, link) => {
        if (err) {
          console.error("❌ Ошибка ссылки:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("✅ Файл загружен:", link);
        res.json({ url: link });
      });
    });
  } catch (err) {
    console.error("🔥 Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});

// Список всех файлов в Photos-port
app.get("/files", async (req, res) => {
  try {
    const storage = await createStorage();

    const folder = storage.root.children.find(
      (c) => c.name === "Photos-port" && c.directory
    );
    if (!folder) return res.json([]);

    const files = await Promise.all(
      folder.children.map(
        (f) =>
          new Promise((resolve) => {
            f.link((err, link) => {
              if (err) resolve(null);
              else resolve({ name: f.name, url: link });
            });
          })
      )
    );

    res.json(files.filter(Boolean));
  } catch (err) {
    console.error("🔥 Ошибка получения списка:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
