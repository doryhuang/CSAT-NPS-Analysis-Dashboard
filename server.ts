import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Zendesk API Proxy
  app.get("/api/zendesk/tickets", async (req, res) => {
    const subdomain = process.env.ZENDESK_SUBDOMAIN;
    const email = process.env.ZENDESK_EMAIL;
    const token = process.env.ZENDESK_API_TOKEN;

    if (!subdomain || !email || !token) {
      return res.status(500).json({ error: "Zendesk configuration missing in environment variables." });
    }

    try {
      const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
      const response = await axios.get(`https://${subdomain}.zendesk.com/api/v2/tickets.json?sort_by=created_at&sort_order=desc`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("Zendesk API Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch tickets from Zendesk" });
    }
  });

  // Fetch specific ticket comments for analysis
  app.get("/api/zendesk/tickets/:id/comments", async (req, res) => {
    const { id } = req.params;
    const subdomain = process.env.ZENDESK_SUBDOMAIN;
    const email = process.env.ZENDESK_EMAIL;
    const token = process.env.ZENDESK_API_TOKEN;

    try {
      const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
      const response = await axios.get(`https://${subdomain}.zendesk.com/api/v2/tickets/${id}/comments.json`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch comments" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
