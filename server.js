import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Gemini Backend",
    message: "Backend is running"
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();

    if (!idea) {
      return res.status(400).json({
        error: "App idea is required."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini API key is not configured yet."
      });
    }

    const prompt = `
You are an AI engine for a no-code Android App Builder.

Convert the user's app idea into a practical Android app specification.

Return ONLY valid JSON.

JSON keys:
appName, summary, pages, features, dataModels, nextSteps

pages must be an array of objects with:
name and purpose

features, dataModels and nextSteps must be arrays of strings.

App name: ${appName}
App idea: ${idea}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          input: prompt
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Gemini API request failed.",
        detail: data?.error?.message || "Unknown Gemini error"
      });
    }

    const text =
      data?.output_text ||
      data?.steps?.flatMap(step =>
        step?.content?.filter(x => x?.type === "text")
          .map(x => x.text) || []
      ).join("\n") ||
      "";

    let result;

    try {
      result = JSON.parse(text.trim());
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
  console.log(`Gemini backend running on port ${port}`);
});
