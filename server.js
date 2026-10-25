import "dotenv/config";
import express from "express";
import cors from "cors";
import { gzipSync } from "node:zlib";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GH_ACTIONS_TOKEN = process.env.GH_ACTIONS_TOKEN || "";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const OWNER = "Shreepals";
const REPO = "ai-app-builder-backend";
const WORKFLOW = "main.yml";

const BACKEND_URL =
  "https://ai-app-builder-backend-1.onrender.com";

const GH_API = "https://api.github.com";
const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
};

let lastBuildRequestedAt = 0;
let lastBuildRunId = null;

const ENGINE_CATALOG = {
  auto: "Choose the most suitable engine for the idea.",
  html: "Create a complete interactive HTML app.",
  phaser: "Use browser-based 2D game design concepts.",
  threejs: "Create a playable 3D game using Three.js.",
  godot: "Explain Godot compatibility honestly; this pipeline builds HTML WebView apps.",
  unity: "Explain Unity compatibility honestly; this pipeline builds HTML WebView apps.",
  unreal: "Explain Unreal compatibility honestly; this pipeline builds HTML WebView apps."
};

function cleanHtml(value) {
  let html = String(value || "").trim();

  html = html
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return html;
}

function isCompleteHtml(html) {
  return (
    typeof html === "string" &&
    /<!doctype html/i.test(html) &&
    /<html[\s>]/i.test(html) &&
    /<\/html>/i.test(html)
  );
}

function isGameIdea(idea) {
  return /\b(game|gaming|3d|2d|racing|car race|football|soccer|cricket|shooting|shooter|runner|platformer|basketball|bike race|driving|fight|fighting|adventure|arcade|गेम|खेल|रेसिंग|क्रिकेट|फुटबॉल)\b/i.test(
    String(idea || "")
  );
}

function selectedEngine(idea, engine) {
  if (isGameIdea(idea)) return "threejs";
  if (engine === "auto") return "html";
  return engine;
}

function makePrompt({ idea, appName, theme, engine }) {
  const game = isGameIdea(idea);
  const chosenEngine = selectedEngine(idea, engine);

  return `
You are a senior app designer and frontend developer.

Create a complete, usable, polished application based on the user's
exact idea. Do not replace the idea with a calculator, generic dashboard,
Kisan app, or unrelated demo.

APP NAME: ${appName}
USER IDEA: ${idea}
THEME: ${theme}
ENGINE: ${chosenEngine}
IS_GAME: ${game}

OUTPUT REQUIREMENTS:
Return ONLY valid JSON with these keys:
{
  "appName": "string",
  "summary": "string",
  "html": "complete standalone HTML document",
  "features": ["string"],
  "engine": "string"
}

GENERAL REQUIREMENTS:
1. Generate the actual app requested by the user.
2. Include a complete responsive interface for mobile and desktop.
3. Include a useful header, navigation, main content, and footer when appropriate.
4. Include all major sections needed by the specific idea.
5. Buttons, forms, navigation, tabs, filters, and settings must work.
6. Do not leave empty sections, placeholder buttons, TODO comments,
   or text such as "coming soon".
7. Use a professional, consistent ${theme} visual design.
8. Use inline CSS and JavaScript inside the HTML.
9. Do not require a server or secret API key for the core demo.
10. If an external live service needs credentials, explain its limitation
    inside the app and provide a working local demonstration.
11. Do not claim fake live data is real.
12. Do not use external images or libraries as a requirement for basic use.
13. The result must be a complete HTML file with <!DOCTYPE html>,
    <html>, <head>, <body>, and closing </html>.
14. Return valid JSON only. Escape quotes and newlines correctly.

IF THIS IS A GAME:
Create an actual playable browser game, not a static game-themed dashboard.
Use Three.js from a CDN for 3D rendering when network access permits.
Include a fallback message if the 3D library cannot load.

GAME-SPECIFIC REQUIREMENTS:
- Create a scene, camera, renderer, lighting, ground and player.
- Make the requested genre recognizable.
- Build game objects and obstacles appropriate to the idea.
- Provide keyboard controls and touch controls for mobile.
- Add start, pause, resume, restart and game-over states.
- Add scoring, collisions and a clear objective.
- Add a visible HUD with score and status.
- Add a short control guide.
- Make the game loop and animation work.
- Avoid representing every object as a plain colored cube.
- Use suitable shapes, colors, proportions and environment details.
- Make the game playable on a mobile screen.
- Do not merely draw a field with a ball if the user asks for football.
  Implement movement and a goal/shooting mechanic.
- For racing, implement steering, acceleration, obstacles and collision.
- For runners, implement jumping, obstacles and distance/score.
- For shooting games, implement aiming, firing, targets and hit detection.
- Match the gameplay mechanics to the actual user's idea.
- Do not claim professional-quality assets or native game-engine output.

IF THIS IS A NORMAL APP:
Build the actual requested workflow and all essential screens.
Use realistic sample data only when necessary and label it as demo data.
Implement forms, add/edit/delete actions and navigation where relevant.
Include useful empty states, validation and feedback messages.

IMPORTANT:
This pipeline packages the generated HTML inside an Android WebView.
Do not claim that this produces a native Unity, Unreal or Godot project.
`;
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing in Render environment."
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35,
        maxOutputTokens: 16000
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini request failed with HTTP ${response.status}`;

    throw new Error(message);
  }

  const output =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

  if (!output.trim()) {
    throw new Error(
      "Gemini returned an empty response. Please try again."
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON. Please try generating again."
    );
  }
}

async function githubRequest(path, options = {}) {
  if (!GH_ACTIONS_TOKEN) {
    throw new Error(
      "GH_ACTIONS_TOKEN is missing in Render environment."
    );
  }

  const response = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      ...GH_HEADERS,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      `GitHub request failed with HTTP ${response.status}`
    );
  }

  return { response, data };
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Gemini Backend"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Gemini Backend",
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    githubTokenConfigured: Boolean(GH_ACTIONS_TOKEN),
    model: GEMINI_MODEL
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(
      req.body?.appName || "My AI App"
    ).trim();
    const theme = String(
      req.body?.theme || "Modern"
    ).trim();
    const engine = String(
      req.body?.engine || "auto"
    ).trim().toLowerCase();

    if (!idea) {
      return res.status(400).json({
        ok: false,
        error: "Please enter your app idea."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing in Render environment."
      });
    }

    if (!Object.hasOwn(ENGINE_CATALOG, engine)) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported engine selection."
      });
    }

    const actualEngine = selectedEngine(idea, engine);

    const generated = await callGemini(
      makePrompt({
        idea,
        appName,
        theme,
        engine: actualEngine
      })
    );

    const html = cleanHtml(generated.html);

    if (!isCompleteHtml(html)) {
      return res.status(502).json({
        ok: false,
        error:
          "AI did not return a complete HTML app. Please try again."
      });
    }

    return res.json({
      ok: true,
      appName: generated.appName || appName,
      summary: generated.summary || "",
      features: Array.isArray(generated.features)
        ? generated.features
        : [],
      engine: actualEngine,
      html
    });
  } catch (error) {
    console.error("Generate error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to generate app."
    });
  }
});

app.post("/api/edit-app", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(
      req.body?.appName || "My AI App"
    ).trim();
    const html = cleanHtml(req.body?.html);
    const editRequest = String(
      req.body?.editRequest || req.body?.instruction || ""
    ).trim();

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing in Render environment."
      });
    }

    if (!html || !isCompleteHtml(html)) {
      return res.status(400).json({
        ok: false,
        error: "Please provide the complete existing HTML app."
      });
    }

    if (!editRequest) {
      return res.status(400).json({
        ok: false,
        error: "Please describe the changes you want."
      });
    }

    const prompt = `
You are editing an existing application.

App name: ${appName}
Original idea: ${idea}
User's requested changes: ${editRequest}

Update the supplied HTML app. Keep all existing working features
unless the user asks to change them. Implement the requested changes.
Return ONLY valid JSON:
{
  "appName": "string",
  "summary": "string",
  "html": "complete standalone HTML document",
  "features": ["string"]
}

Existing HTML:
${html}
`;

    const generated = await callGemini(prompt);
    const updatedHtml = cleanHtml(generated.html);

    if (!isCompleteHtml(updatedHtml)) {
      return res.status(502).json({
        ok: false,
        error: "AI did not return a complete edited app."
      });
    }

    return res.json({
      ok: true,
      appName: generated.appName || appName,
      summary: generated.summary || "",
      features: Array.isArray(generated.features)
        ? generated.features
        : [],
      html: updatedHtml
    });
  } catch (error) {
    console.error("Edit app error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to edit app."
    });
  }
});

app.post("/api/build", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(
      req.body?.appName || req.body?.app_name || "My AI App"
    ).trim();
    const html = cleanHtml(req.body?.html);

    if (!idea) {
      return res.status(400).json({
        ok: false,
        error: "Please provide the app idea."
      });
    }

    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "GH_ACTIONS_TOKEN is missing in Render environment."
      });
    }

    if (!html || !isCompleteHtml(html)) {
      return res.status(400).json({
        ok: false,
        error:
          "Complete HTML is required. Generate the app before building APK."
      });
    }

    const appHtmlGzipB64 = gzipSync(
      Buffer.from(html, "utf8")
    ).toString("base64");

    const dispatchPath =
      `/repos/${OWNER}/${REPO}/actions/workflows/` +
      `${WORKFLOW}/dispatches`;

    const dispatchResponse = await fetch(
      `${GH_API}${dispatchPath}`,
      {
        method: "POST",
        headers: GH_HEADERS,
        body: JSON.stringify({
          ref: "main",
          inputs: {
            idea,
            app_name: appName,
            app_html_gzip_b64: appHtmlGzipB64
          }
        })
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();

      throw new Error(
        `GitHub could not start APK build: ${errorText}`
      );
    }

    lastBuildRequestedAt = Date.now();
    lastBuildRunId = null;

    return res.json({
      ok: true,
      message: "APK build started.",
      appName,
      statusUrl: `${BACKEND_URL}/api/build-status`
    });
  } catch (error) {
    console.error("Build error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Could not start APK build."
    });
  }
});

app.get("/api/build-status", async (_req, res) => {
  try {
    const path =
      `/repos/${OWNER}/${REPO}/actions/workflows/` +
      `${WORKFLOW}/runs?per_page=10`;

    const { data } = await githubRequest(path);

    const runs = Array.isArray(data.workflow_runs)
      ? data.workflow_runs
      : [];

    let run = null;

    if (lastBuildRunId) {
      run = runs.find(
        (item) => item.id === lastBuildRunId
      ) || null;
    }

    if (!run && lastBuildRequestedAt > 0) {
      const earliestTime = lastBuildRequestedAt - 15000;

      run = runs.find((item) => {
        return (
          new Date(item.created_at).getTime() >= earliestTime
        );
      }) || null;
    }

    if (!run) {
      return res.json({
        ok: true,
        status: "waiting",
        message: "Waiting for GitHub Actions to start the build."
      });
    }

    lastBuildRunId = run.id;

    if (run.status !== "completed") {
      return res.json({
        ok: true,
        status: run.status || "in_progress",
        runId: run.id,
        message: "APK is being built."
      });
    }

    if (run.conclusion !== "success") {
      return res.json({
        ok: true,
        status: "failed",
        runId: run.id,
        message: "APK build failed. Check GitHub Actions logs."
      });
    }

    const artifactsPath =
      `/repos/${OWNER}/${REPO}/actions/runs/` +
      `${run.id}/artifacts`;

    const { data: artifactData } =
      await githubRequest(artifactsPath);

    const artifacts = Array.isArray(artifactData.artifacts)
      ? artifactData.artifacts
      : [];

    const artifact = artifacts.find((item) => {
      return (
        item.name.toLowerCase() === "myapp-apk" &&
        !item.expired
      );
    });

    if (!artifact) {
      return res.json({
        ok: true,
        status: "completed",
        runId: run.id,
        message:
          "Build succeeded, but the Myapp-APK artifact was not found."
      });
    }

    return res.json({
      ok: true,
      status: "success",
      runId: run.id,
      message: "APK build completed.",
      downloadUrl:
        `${BACKEND_URL}/api/apk-download?run_id=${run.id}`,
      artifactName: artifact.name
    });
  } catch (error) {
    console.error("Build status error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Could not check build status."
    });
  }
});

app.get("/api/apk-download", async (req, res) => {
  try {
    const runId = String(req.query?.run_id || "").trim();

    if (!/^\d+$/.test(runId)) {
      return res.status(400).json({
        ok: false,
        error: "A valid run_id is required."
      });
    }

    const artifactsPath =
      `/repos/${OWNER}/${REPO}/actions/runs/` +
      `${runId}/artifacts`;

    const { data } = await githubRequest(artifactsPath);

    const artifacts = Array.isArray(data.artifacts)
      ? data.artifacts
      : [];

    const artifact = artifacts.find((item) => {
      return (
        item.name.toLowerCase() === "myapp-apk" &&
        !item.expired
      );
    });

    if (!artifact) {
      return res.status(404).json({
        ok: false,
        error: "APK artifact not found or expired."
      });
    }

    const zipPath =
      `/repos/${OWNER}/${REPO}/actions/artifacts/` +
      `${artifact.id}/zip`;

    const { response } = await githubRequest(zipPath);

    const zipBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    res.setHeader(
      "Content-Type",
      "application/zip"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Myapp-APK.zip"`
    );

    return res.send(zipBuffer);
  } catch (error) {
    console.error("APK download error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Could not download APK artifact."
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `AI App Builder backend running on port ${PORT}`
  );
});
