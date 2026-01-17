const express = require("express");
const sequelize = require("../database");
const auth = require("../middleware/auth");

const router = express.Router();
const { notification: Notification } = sequelize.models;


router.get("/", auth, async (req, res, next) => {
  try {
    const unread = String(req.query.unread || "") === "1";
    const where = { userId: req.user.userId };
    if (unread) where.read_at = null;

    const list = await Notification.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: 50
    });

    res.json(list);
  } catch (e) { next(e); }
});


router.post("/:id/read", auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const n = await Notification.findOne({ where: { id, userId: req.user.userId } });
    if (!n) return res.status(404).json({ error: "Notification not found" });

    await n.update({ read_at: new Date() });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
