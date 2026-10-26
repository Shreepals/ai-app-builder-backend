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
  const chosenEngine = game ? "threejs" :
    (engine === "auto" ? "html" : engine);

  return `
You are a senior software engineer, UI/UX designer,
full-stack app planner and game developer.

Build a COMPLETE, IDEA-SPECIFIC, FUNCTIONAL application.

APP NAME: ${appName}
USER IDEA: ${idea}
THEME: ${theme}
ENGINE: ${chosenEngine}
GAME: ${game}

CRITICAL RULE:
Do not make a generic dashboard, calculator, landing page,
or unrelated demo. Build the actual application described by
the user's idea.

RETURN ONLY valid JSON:
{
  "appName": "string",
  "summary": "string",
  "html": "complete HTML document",
  "features": ["feature 1", "feature 2"],
  "engine": "string"
}

==============================
COMPLETE APP REQUIREMENTS
==============================

1. First understand the exact purpose of the user's idea.
2. Identify the users, workflows, screens, sections and tools
   required for that specific application.
3. Build all important screens in one complete responsive app.
4. Include a polished header, app logo/name, navigation,
   sidebar or mobile menu where appropriate, main content,
   footer where useful, and responsive layouts.
5. Create a complete dashboard when the idea needs a dashboard.
6. Do not omit major sections of the requested application.
7. Do not create only a home page or a few isolated buttons.
8. Include realistic demo data when external services are unavailable.
   Clearly label demo data; never claim it is live data.
9. Include empty states, validation, loading feedback and
   success/error messages where appropriate.
10. Use consistent typography, spacing, cards, icons and colors.
11. Make the design work on small Android screens and desktop.
12. Avoid a page that looks like a plain school project.
13. Do not leave TODOs, blank panels, unfinished sections,
    placeholder buttons or "coming soon" features.
14. Do not claim that a feature works if it is not implemented.

==============================
FUNCTIONAL BUTTON REQUIREMENTS
==============================

Every visible interactive control must have a real action.

Depending on the actual app idea, implement:
- Navigation and sidebar menu.
- Dashboard/home navigation.
- User profile and account screen.
- Settings screen.
- Search and filtering.
- Add, edit, delete and save operations where relevant.
- Forms with validation.
- Tabs, dropdowns, modals and confirmation dialogs.
- Notifications and helpful feedback messages.
- Back navigation and mobile menu.
- Local persistence using localStorage when appropriate.
- Working keyboard and touch interactions.

Do not add irrelevant buttons just to increase their number.
Create all controls the requested app genuinely needs.
Every visible button must either perform its action or be
disabled with a clear explanation when the action is unavailable.

==============================
APP-SPECIFIC WORKFLOWS
==============================

Do not use one fixed layout for every idea.

For a shopping app, build product browsing, search, product
details, cart and checkout demo as appropriate.

For a social/video app, build feed, profiles, navigation,
interactions and upload UI as appropriate.

For an education app, build courses, lessons, progress and
quizzes as appropriate.

For a business/admin app, build relevant statistics, tables,
filters, forms and management screens.

For a finance app, build relevant balances, transactions,
charts and calculations using clearly labelled demo data.

For any other idea, design its own complete set of screens
and workflows based on the user's exact description.

Do not force unrelated features into the application.

==============================
REAL 3D GAME REQUIREMENTS
==============================

When GAME is true, create a playable 3D game using Three.js,
not a static dashboard and not a 2D page pretending to be 3D.

Create:
- A real Three.js scene, perspective camera and renderer.
- Appropriate lighting, shadows where practical, ground
  and a recognisable game environment.
- Genre-specific player, obstacles, targets and objects.
- Camera movement appropriate to the game.
- Keyboard controls and visible mobile touch controls.
- Start, pause, resume and restart.
- Score, objective, game status and game-over handling.
- Collision detection and game rules.
- Animation loop and responsive resizing.
- Instructions showing how to play.
- Clear visual feedback when the player acts or scores.

The mechanics must match the actual requested genre.

RACING:
Create a controllable car, track, steering, acceleration,
braking, obstacles or opponents, speed display and collisions.

FOOTBALL:
Create a playable football field, controllable player,
ball movement, kicking/shooting, goals, goalkeeper or
opponents where practical, score and match restart.

CRICKET:
Create batting controls, ball delivery, timing-based hits,
runs, wickets and match status.

SHOOTING:
Create aiming, firing, targets/enemies, hit detection,
health or score and restart.

RUNNER:
Create running movement, jumping, obstacles, collision
and distance or score progression.

For other genres, create mechanics specific to the idea.

Do not represent the whole game using only a few plain cubes.
Use suitable shapes, proportions, materials and environment
details. Make the game playable rather than just attractive.

Load Three.js safely. If the library cannot load, display a
clear error instead of silently showing an empty screen.

==============================
TECHNICAL REQUIREMENTS
==============================

- Return one complete standalone HTML document.
- Include <!DOCTYPE html>, html, head and body.
- Include CSS and JavaScript in the HTML.
- Keep code readable and organised.
- Avoid syntax errors and undefined variables.
- Avoid nonfunctional links and controls.
- Do not require secret API keys for the core demo.
- Use localStorage only for suitable local demo data.
- Do not pretend that a browser demo is a production backend.
- Do not claim native Unity, Unreal or Godot output.
- This pipeline packages HTML inside an Android WebView.
- Do not add payment features unless the user requests them.
- Prioritise a complete working app over decorative text.

Return valid JSON only. Escape quotes and newlines correctly.
The html value must contain the entire working application.
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
