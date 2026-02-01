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
    console.log("[DELETE] incoming body:", JSON.stringify(req.body));
    const { public_id, photo_id } = req.body || {};
    if (!public_id && !photo_id) return res.status(400).json({ error: "public_id or photo_id required" });

    const authHeader = req.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ error: "Authorization required" });

    // Проверяем user по токену
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("[DELETE] auth.getUser error:", userErr);
      return res.status(401).json({ error: "Invalid token" });
    }
    const userId = userData.user.id;
    console.log("[DELETE] userId:", userId);

    // Если public_id не передан — попробуем получить из БД по photo_id
    let targetPublicId = public_id;
    if (!targetPublicId && photo_id) {
      const { data: row, error: selErr } = await supabaseAdmin.from("photos").select("public_id,user_id").eq("id", photo_id).maybeSingle();
      if (selErr) { console.error("[DELETE] select error:", selErr); return res.status(500).json({ error: "DB error" }); }
      if (!row) return res.status(404).json({ error: "Photo not found" });
      if (row.user_id !== userId) return res.status(403).json({ error: "Forbidden: not owner" });
      targetPublicId = row.public_id;
    }

    if (!targetPublicId) return res.status(400).json({ error: "public_id not found" });
    console.log("[DELETE] targetPublicId (raw):", targetPublicId);

    // Очищаем public_id: если передали полный url — извлечь путь, убрать расширение
    // Пример Cloudinary URL: https://res.cloudinary.com/<cloud>/image/upload/v123/Photos-port/abc_def.webp
    const extract = (v) => {
      if (v.startsWith("http")) {
        const m = v.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
        return m ? m[1] : v;
      }
      // убрать возможный расширение
      return v.replace(/\.[a-z0-9]+$/i, "");
    };
    const cleanPublicId = extract(targetPublicId);
    console.log("[DELETE] cleanPublicId:", cleanPublicId);

    // Удаляем из Cloudinary
    const destroyRes = await cloudinary.uploader.destroy(cleanPublicId, { resource_type: "image" });
    console.log("[DELETE] cloudinary destroyRes:", destroyRes);

    if (destroyRes.result !== "ok" && destroyRes.result !== "not found") {
      console.error("[DELETE] Cloudinary failed:", destroyRes);
      return res.status(500).json({ error: "Cloudinary delete failed", details: destroyRes });
    }

    // Удаляем запись в Supabase
    const { error: delErr } = await supabaseAdmin.from("photos").delete().match({ public_id: targetPublicId });
    if (delErr) {
      console.error("[DELETE] DB delete error:", delErr);
      return res.status(500).json({ error: "DB delete failed" });
    }

    console.log("[DELETE] success for", cleanPublicId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE] fatal error:", err);
    res.status(500).json({ error: "Ошибка при удалении" });
  }
});


app.listen(PORT, () => console.log(`🚀 Server запущен на порту ${PORT}`));
