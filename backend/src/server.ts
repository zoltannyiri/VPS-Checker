
import express from "express";
import { startMonitoring, getMonitorStatuses } from "./monitor.js";

const app = express();
const PORT = 5001;

app.use(express.json());

app.get("/api/monitors", (_req, res) => {
  res.json(getMonitorStatuses());
});

app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  startMonitoring();
});
