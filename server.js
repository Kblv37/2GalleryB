// import express from "express";
// import cors from "cors";
// import bodyParser from "body-parser";
// import multer from "multer";
// import { Storage } from "megajs";

// const app = express();
// app.use(cors());
// app.use(bodyParser.json());

// // Multer для приёма файлов
// const upload = multer({ storage: multer.memoryStorage() });

// // Подключение к MEGA
// const mega = new Storage({
//   email: process.env.MEGA_EMAIL,
//   password: process.env.MEGA_PASSWORD
// });

// await mega.ready; // ждём подключения

// // Маршрут для загрузки
// app.post("/upload", upload.single("file"), async (req, res) => {
//   try {
//     const fileBuffer = req.file.buffer;
//     const fileName = req.file.originalname;

//     const uploadedFile = await mega.upload(fileName, fileBuffer).complete;
//     const link = await uploadedFile.link();

//     res.json({ url: link });
//   } catch (error) {
//     console.error("Upload error:", error);
//     res.status(500).json({ error: "Ошибка загрузки файла" });
//   }
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Server running on ${PORT}`));


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
    // Подключение к MEGA
    const storage = new Storage({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD
    });

    await new Promise((resolve, reject) => {
      storage.on("ready", resolve);
      storage.on("error", reject);
    });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Нет файла" });

    const megaFile = storage.upload(file.originalname, file.buffer.length);
    megaFile.end(file.buffer);

    megaFile.on("complete", file => {
      file.link((err, link) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ url: link });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
