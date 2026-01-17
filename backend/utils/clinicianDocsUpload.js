const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "clinician_docs");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function safeExt(originalname = "") {
    const ext = path.extname(originalname).toLowerCase();
    return ext && ext.length <= 10 ? ext : "";
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = safeExt(file.originalname);
        cb(null, `${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
});

function fileFilter(req, file, cb) {
    const ok = ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only PDF/JPG/PNG allowed"));
    cb(null, true);
}

const uploadClinicianDocs = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB por archivo
        files: 10,
    },
});

module.exports = { uploadClinicianDocs, UPLOAD_DIR };
