import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { Storage } from "mega";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Загружаем файлы через multer
const upload = multer({ storage: multer.memoryStorage() });

// Подключение к MEGA
const mega = new Storage({
  email: process.env.MEGA_EMAIL,
  password: process.env.MEGA_PASSWORD
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;

    const file = await mega.upload(fileName, fileBuffer).complete;
    const link = await file.link();

    res.json({ url: link });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка загрузки файла" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
