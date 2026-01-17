const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const app = require("./app");
const sequelize = require("./database");
const seedAdmin = require("./seed/seedAdmin");
const { setIO } = require("./utils/socket");

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] },
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (!payload?.userId) return next(new Error("unauthorized"));

    socket.data.userId = payload.userId;

    socket.join(`user:${payload.userId}`);

    const {
      admin_profile: AdminProfile,
      clinician_profile: ClinicianProfile,
      patient_profile: PatientProfile,
    } = sequelize.models;

    const [a, c, p] = await Promise.all([
      AdminProfile.findOne({ where: { userId: payload.userId }, attributes: ["verification_status"] }),
      ClinicianProfile.findOne({ where: { userId: payload.userId }, attributes: ["verification_status"] }),
      PatientProfile.findOne({ where: { userId: payload.userId }, attributes: ["id"] }),
    ]);

    if (a?.verification_status === "verified") socket.join("admins");
    if (c?.verification_status === "verified") socket.join("clinicians");
    if (p) socket.join("patients");

    return next();
  } catch (e) {
    return next(new Error("unauthorized"));
  }
});


setIO(io);

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log("DB synced");

    await seedAdmin(sequelize);

    server.listen(PORT, () => {
      console.log(`TesaHealth API (HTTP+Socket) running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error("DB init failed:", err);
    process.exit(1);
  }
})();
