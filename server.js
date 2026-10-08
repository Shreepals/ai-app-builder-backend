import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Gemini Backend",
    message: "Backend is running"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(
      req.body?.appName || "My AI App"
    ).trim();

    console.log("=================================");
    console.log("AI GENERATE REQUEST RECEIVED");
    console.log("App name:", appName);
    console.log("Idea received:", Boolean(idea));
    console.log("Gemini key configured:", Boolean(GEMINI_API_KEY));
    console.log("Gemini model:", GEMINI_MODEL);

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
You are the AI engine for a no-code Android App Builder.

Convert the user's app idea into a practical Android app specification.

Return ONLY valid JSON.

Use exactly these JSON keys:
appName
summary
pages
features
dataModels
nextSteps

pages must be an array of objects containing:
name
purpose

features, dataModels and nextSteps must be arrays of strings.

App name: ${appName}

App idea: ${idea}
`;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/interactions";

    console.log("Calling Gemini Interactions API...");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: prompt,
        generation_config: {
          thinking_level: "low"
        }
      })
    });

    const data = await response.json();

    console.log("Gemini HTTP status:", response.status);
    console.log("Gemini response:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(502).json({
        error: "Gemini API request failed.",
        status: response.status,
        detail:
          data?.error?.message ||
          JSON.stringify(data?.error || data)
      });
    }

    const text = String(
  data?.output_text ||
  data?.output?.flatMap(item => item.content || [])
    ?.map(item => item.text || "")
    ?.join("") ||
  ""
).trim();

    console.log("Gemini text received:", Boolean(text));

    if (!text) {
      return res.status(502).json({
        error: "Gemini returned an empty response.",
        detail: JSON.stringify(data)
      });
    }

    let result;

    try {
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      result = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError.message);

      result = {
        appName,
        summary: text,
        pages: [],
        features: [],
        dataModels: [],
        nextSteps: []
      };
    }

    console.log("AI GENERATION SUCCESS");

    return res.json({
      ok: true,
      result
    });

  } catch (error) {
    console.error("AI GENERATION ERROR");
    console.error("Message:", error?.message);
    console.error("Stack:", error?.stack);

    return res.status(500).json({
      error: "AI generation failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Gemini backend running on port ${port}`);
});
