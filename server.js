
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
const API_BASE = "https://api.github.com";
const BACKEND_URL = "https://ai-app-builder-backend-1.onrender.com";

let lastBuildRequestedAt = 0;

async function github(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
}

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
Return only valid JSON with these keys:
appName, summary, pages, features, dataModels, nextSteps.
pages must be an array of objects with name and purpose.
features, dataModels and nextSteps must be arrays of strings.
App name: ${appName}
App idea: ${idea}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: prompt }] }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
          }
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

    const output = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!output) {
      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    let result;
    try {
      result = JSON.parse(
        output.replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "")
          .trim()
      );
    } catch {
      return res.status(502).json({
        error: "Gemini returned invalid JSON. Please try again."
      });
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

    const response = await github(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" })
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Could not start GitHub Actions build.",
        detail: await response.text()
      });
    }

    lastBuildRequestedAt = Date.now() - 30000;

    return res.status(202).json({
      ok: true,
      message: "APK build started. Please wait for the build to finish."
    });
  } catch (error) {
    return res.status(500).json({
      error: "APK build request failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.get("/api/build-status", async (_req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured in Render."
      });
    }

    const response = await github(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Could not check build status.",
        detail: await response.text()
      });
    }

    const data = await response.json();
    const runs = data.workflow_runs || [];

    const run = runs.find(item =>
      lastBuildRequestedAt
        ? new Date(item.created_at).getTime() >= lastBuildRequestedAt
        : true
    );

    if (!run) {
      return res.json({
        ok: true,
        status: "not_found",
        message: "Build not found yet. Please wait and try again."
      });
    }

    const result = {
      ok: true,
      status: run.status,
      conclusion: run.conclusion,
      runUrl: run.html_url,
      downloadUrl: null,
      message: "Build is still running."
    };

    if (run.status !== "completed") {
      return res.json(result);
    }

    if (run.conclusion !== "success") {
      result.message = "Build failed. Open the GitHub Actions run to check the error.";
      return res.json(result);
    }

    const artifactResponse = await github(
      `/repos/${OWNER}/${REPO}/actions/runs/${run.id}/artifacts?per_page=100`
    );

    if (!artifactResponse.ok) {
      return res.status(502).json({
        error: "Build succeeded, but artifacts could not be checked.",
        detail: await artifactResponse.text()
      });
    }

    const artifactData = await artifactResponse.json();
    const artifact = (artifactData.artifacts || []).find(item =>
      item.name === "AI-App-Builder-APK" && !item.expired
    );

    if (!artifact) {
      result.message = "Build finished, but the APK artifact was not found.";
      return res.json(result);
    }

    result.downloadUrl =
      `${BACKEND_URL}/api/apk-download?run_id=${run.id}`;
    result.message = "APK is ready to download.";

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Could not check build status.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.get("/api/apk-download", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured in Render."
      });
    }

    const runId = String(req.query.run_id || "");

    if (!/^\d+$/.test(runId)) {
      return res.status(400).json({ error: "Invalid build run ID." });
    }

    const artifactResponse = await github(
      `/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts?per_page=100`
    );

    if (!artifactResponse.ok) {
      return res.status(502).json({
        error: "Could not find the APK artifact.",
        detail: await artifactResponse.text()
      });
    }

    const data = await artifactResponse.json();
    const artifact = (data.artifacts || []).find(item =>
      item.name === "myaap-apk" && !item.expired
    );

    if (!artifact) {
      return res.status(404).json({
        error: "APK artifact not found or expired."
      });
    }

    const zipResponse = await github(
      `/repos/${OWNER}/${REPO}/actions/artifacts/${artifact.id}/zip`
    );

    if (!zipResponse.ok) {
      return res.status(502).json({
        error: "APK download failed.",
        detail: await zipResponse.text()
      });
    }

    const zip = Buffer.from(await zipResponse.arrayBuffer());

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="AI-App-Builder-APK.zip"'
    );
    return res.send(zip);
  } catch (error) {
    return res.status(500).json({
      error: "APK download failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log("Gemini backend running on port " + port);
});
