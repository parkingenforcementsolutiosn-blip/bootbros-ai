import express from "express";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.json({
    name: "BootBros AI",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "bootbros-ai",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BootBros AI running on port ${PORT}`);
});
