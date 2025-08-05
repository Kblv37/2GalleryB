import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "megajs";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Подключение к MEGA
function createStorage() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD,
    });

    storage.on("ready", () => {
      console.log("✅ MEGA подключение установлено");
      resolve(storage);
    });

    storage.on("error", (err) => {
      console.error("❌ Ошибка MEGA:", err);
      reject(err);
    });
  });
}

// Загрузка файла
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не передан" });
    }

    console.log(`📥 Загружается: ${file.originalname}, размер: ${file.size}`);

    const storage = await createStorage();

    // ищем или создаём папку Photos-port
    let folder = storage.root.children.find(
      (c) => c.name === "Photos-port" && c.directory
    );
    if (!folder) {
      folder = storage.root.mkdir("Photos-port");
    }

    // загружаем
    const uploader = folder.upload(file.originalname, {
      allowUploadBuffering: true,
      size: file.buffer.length,
    });
    uploader.end(file.buffer);

    // ждём завершения загрузки
    uploader.on("complete", async () => {
      console.log(`✅ Файл ${file.originalname} загружен`);

      // ищем файл в папке
      const uploadedFile = folder.children.find((f) => f.name === file.originalname);
      if (!uploadedFile) {
        return res.status(500).json({ error: "Файл загружен, но не найден" });
      }

      // получаем ссылку
      uploadedFile.link((err, link) => {
        if (err || !link) {
          console.error("❌ Ошибка получения ссылки:", err);
          return res.status(500).json({ error: "Не удалось получить ссылку" });
        }
        console.log("🔗 Ссылка:", link);
        res.json({ url: link });
      });
    });
  } catch (err) {
    console.error("🔥 Ошибка загрузки:", err);
    res.status(500).json({ error: err.message });
  }
});

// Получение всех файлов
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
              if (err || !link) resolve(null);
              else resolve({ name: f.name, url: link });
            });
          })
      )
    );

    res.json(files.filter(Boolean));
  } catch (err) {
    console.error("🔥 Ошибка списка:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер работает на порту ${PORT}`);
});
