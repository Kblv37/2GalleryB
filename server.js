// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 10000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("✅ Server работает с Cloudinary"));

// Upload: оставляем upload_stream как было — возвращаем url и public_id
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Файл не найден" });

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "Photos-port", resource_type: "image" },
      (error, result) => {
        if (error) {
          console.error("Ошибка Cloudinary:", error);
          return res.status(500).json({ error: error.message });
        }
        // вернём secure_url и public_id
        res.json({ url: result.secure_url, public_id: result.public_id });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error("Ошибка загрузки:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Безопасное удаление: тело запроса { public_id, photo_id } и заголовок Authorization: Bearer <user_token>
app.delete("/delete", async (req, res) => {
  try {
    const { public_id, photo_id } = req.body;
    if (!public_id) return res.status(400).json({ error: "public_id required" });

    const authHeader = req.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ error: "Authorization required" });

    // Получаем user по токену — чтобы убедиться, что запрос делает владелец
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("Auth getUser error:", userErr);
      return res.status(401).json({ error: "Invalid token" });
    }
    const userId = userData.user.id;

    // Проверяем, что запись photos с таким public_id принадлежит этому userId
    const { data: photoRow, error: selectErr } = await supabaseAdmin
      .from("photos")
      .select("id, user_id")
      .eq("public_id", public_id)
      .maybeSingle();

    if (selectErr) {
      console.error("DB select error:", selectErr);
      return res.status(500).json({ error: "DB error" });
    }
    if (!photoRow) return res.status(404).json({ error: "Photo not found" });
    if (photoRow.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden: not owner" });
    }

    // Удаляем из Cloudinary
    const destroyRes = await cloudinary.uploader.destroy(public_id, { resource_type: "image" });
    if (destroyRes.result !== "ok" && destroyRes.result !== "not found") {
      console.error("Cloudinary destroy result:", destroyRes);
      return res.status(500).json({ error: "Cloudinary delete failed" });
    }

    // Удаляем запись в Supabase (service role)
    const { error: delErr } = await supabaseAdmin
      .from("photos")
      .delete()
      .eq("public_id", public_id);

    if (delErr) {
      console.error("DB delete error:", delErr);
      return res.status(500).json({ error: "DB delete failed" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Ошибка удаления:", err);
    res.status(500).json({ error: "Ошибка при удалении" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server запущен на порту ${PORT}`));
