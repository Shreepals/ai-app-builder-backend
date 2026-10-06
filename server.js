import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 10000);

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Backend",
    message: "Backend is running"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(
      req.body?.appName || "My AI App"
    ).trim();

    if (!idea) {
      return res.status(400).json({
        error: "App idea is required."
      });
    }

    if (!client) {
      return res.status(503).json({
        error: "AI API key is not configured yet."
      });
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6-luna",

      instructions:
        "You are an AI mobile-app architect. Convert the user's app idea into a practical Android app specification. " +
        "Return ONLY valid JSON with keys appName, summary, pages, features, dataModels, nextSteps. " +
        "pages is an array of objects with name and purpose. " +
        "features, dataModels and nextSteps are arrays of strings.",

      input:
        `App name: ${appName}\nApp idea: ${idea}`
    });

    const text = response.output_text?.trim() || "";

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      result = {
        appName,
        summary: text,
        pages: [],
        features: [],
        dataModels: [],
        nextSteps: []
      };
    }

    res.json({
      ok: true,
      result
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "AI generation failed.",
      detail: error?.message || "Unknown error"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend running on port ${port}`);
});
