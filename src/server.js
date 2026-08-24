import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.get("/", (req, res) => {
  res.json({
    name: "BootBros AI",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.json({
      ok: true,
      service: "bootbros-ai",
      database: "connected",
      databaseTime: result.rows[0].time
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      ok: false,
      service: "bootbros-ai",
      database: "disconnected"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BootBros AI running on port ${PORT}`);
});
