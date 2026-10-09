````javascript
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GH_ACTIONS_TOKEN = process.env.GH_ACTIONS_TOKEN || "";

const OWNER = "Shreepals";
const REPO = "ai-app-builder-backend";
const WORKFLOW = "main.yml";

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "AI App Builder Gemini Backend" });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    githubTokenConfigured: Boolean(GH_ACTIONS_TOKEN),
    model: GEMINI_MODEL
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();

    if (!idea) {
      return res.status(400).json({ error: "App idea is required." });
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini API key is not configured."
      });
    }

    const prompt = `Create a practical Android app specification.
Return only valid JSON with keys appName, summary, pages, features,
dataModels, nextSteps.
pages must contain objects with name and purpose.
features, dataModels and nextSteps must be arrays of strings.
App name: ${appName}
App idea: ${idea}`;

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
          input: prompt,
          generation_config: { thinking_level: "low" }
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

    const output = String(data?.output_text || "").trim();

    if (!output) {
      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    let result;
    try {
      result = JSON.parse(
        output.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim()
      );
    } catch {
      result = {
        appName,
        summary: output,
        pages: [],
        features: [],
        dataModels: [],
        nextSteps: []
      };
    }

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({
      error: "AI generation failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.post("/api/build", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();

    if (!idea) {
      return res.status(400).json({ error: "App idea is required." });
    }

    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured in Render."
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GH_ACTIONS_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ref: "main" })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({
        error: "Could not start GitHub Actions build.",
        detail
      });
    }

    return res.status(202).json({
      ok: true,
      message: "GitHub Actions build started. This does not yet provide a downloadable APK."
    });
  } catch (error) {
    return res.status(500).json({
      error: "APK build request failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log("Gemini backend running on port " + port);
});
````
  
