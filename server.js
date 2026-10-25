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

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28"
};

const ENGINE_CATALOG = {
  auto: "AI choose the most suitable engine",
  html: "HTML, CSS and JavaScript web apps",
  phaser: "Phaser HTML5 2D browser games",
  threejs: "Three.js browser-based 3D games",
  godot: "Godot Engine 2D and 3D games",
  unity: "Unity 2D and 3D games",
  unreal: "Unreal Engine high-end 3D games"
};

let lastBuildRequestedAt = 0;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Multi-Engine Backend",
    message: "Backend is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    githubTokenConfigured: Boolean(GH_ACTIONS_TOKEN),
    model: GEMINI_MODEL,
    engines: Object.keys(ENGINE_CATALOG)
  });
});

function cleanHtml(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function makePrompt({ appName, idea, theme, engine }) {
  const gameRequest =
    /\b(game|gaming|racing|race|car game|football|soccer|cricket|shooting|shooter|runner|running|adventure|platformer|minecraft|survival|fighting|combat|puzzle|sports|3d game|video game|fps|battle royale)\b|गेम|खेल|रेसिंग|शूटिंग|फुटबॉल|क्रिकेट|दौड़|लड़ाई/i.test(idea);

  const selectedEngine = gameRequest ? "threejs" : engine;

  return `
You are an expert professional 3D game developer and application developer.
Build the actual requested product, not a mockup.

APP NAME: ${appName}
USER IDEA: ${idea}
THEME: ${theme}
ENGINE: ${selectedEngine}
IS GAME: ${gameRequest}

CORE RULE:
Understand the user's exact idea before creating anything.
Do not substitute another game type.
Every game must have its own appropriate world, objects,
gameplay, controls, animations, scoring and restart logic.

${gameRequest ? `
BUILD A REAL PLAYABLE 3D GAME WITH THREE.JS.

QUALITY TARGET:
Aim for the quality of a polished mobile 3D racing game:
a visible environment, recognizable 3D models, good lighting,
materials, shadows where practical, animations, responsive controls
and a clear game interface.
Apply this quality to the requested genre, not racing visuals
to every genre.

RACING:
Build a road or race track, recognizable car with wheels,
opponent cars, roadside scenery, steering, acceleration,
braking, collisions, speed, distance and race results.

FOOTBALL / SOCCER:
Build a green 3D pitch, recognizable player characters,
football, proper goalposts and net, goalkeeper, opponents,
movement, kicking, passing, goal detection, score and match timer.

CRICKET:
Build a cricket ground, pitch, batter, bat, ball, wickets,
bowling and batting interaction, runs, wickets and overs.

SHOOTING:
Build a 3D environment, recognizable player view or character,
targets or opponents, aiming, shooting, hit detection,
ammunition, health and score.

RUNNING / ENDLESS RUNNER:
Build a 3D path, animated runner, obstacles, jumping,
dodging, collisions and distance score.

ADVENTURE / SURVIVAL:
Build a 3D world, controllable character, exploration,
interactions, objectives and health or inventory as appropriate.

FIGHTING:
Build an arena, recognizable fighters, movement, attacks,
health bars, hit detection and victory or defeat.

PUZZLE:
Build a genuine interactive puzzle with visible 3D pieces,
valid moves, win detection and reset.

OTHER GAME IDEAS:
Create gameplay and objects that specifically fit the requested idea.
Never turn football, cricket, shooting or adventure into racing.

3D WORLD REQUIREMENTS:
- Use a perspective camera, renderer, lighting, ground and environment.
- Use recognizable shapes and assembled geometry for characters,
  cars, balls, buildings and other objects.
- Avoid using plain colored cubes as substitutes for the main
  character, car, ball or goal when a recognizable model can be built.
- Use animation and a continuously updating game loop.
- Update the camera to follow the player when appropriate.
- Resize correctly on mobile and desktop.
- Add collision detection, gameplay state and real scoring.
- Load required libraries reliably and display a useful error
  if Three.js cannot load.
- Do not pretend that a missing model or feature exists.

CONTROLS:
- Provide large mobile touch controls.
- Provide suitable keyboard and mouse controls on computers.
- Start begins gameplay.
- Pause stops gameplay updates.
- Resume continues gameplay.
- Restart resets the game to its initial state.
- Movement, kick, shoot, steering and jump controls must actually
  affect the appropriate game objects.
- Display instructions and game-over or victory screens as needed.
- Avoid page scrolling when the user operates game controls.

DASHBOARD:
- Desktop: collapsible left sidebar.
- Mobile: sidebar hidden initially with a working three-dot
  menu button in the top-right.
- The three-dot menu must open and close.
- Include Dashboard, Home and relevant sections.
- For games, include Play, Instructions, Score, Progress,
  Levels and Settings when appropriate.
- Each navigation item must open the correct section.
- Every visible button must work.
- Use a polished responsive interface, not an empty dashboard.
- Save progress locally when appropriate.

IF THIS IS NOT A GAME:
Build a complete, idea-specific application with a working
dashboard, navigation, forms and useful features.
Do not force a non-game app into Three.js.

TECHNICAL REQUIREMENTS:
- Return one complete standalone index.html document.
- Embed CSS and JavaScript in the HTML.
- Use Three.js for browser 3D games.
- Use HTML, CSS and JavaScript for ordinary apps.
- Do not include secret keys or fabricate live API integrations.
- Ensure functions and event handlers exist before using them.
- Check for missing DOM elements and runtime errors.
- Keep core gameplay functional without external 3D model downloads.
- Do not claim native Unity, Unreal or Godot project output
  when only HTML has been generated.
- Be honest in the summary about any limitations.

Return ONLY valid JSON with these keys:
{
  "appName": "name",
  "summary": "features and limitations",
  "engine": "actual engine used",
  "html": "<!DOCTYPE html> ...",
  "features": ["feature 1", "feature 2"]
}

The html value must contain a complete valid HTML document.
`;
  }

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();
    const theme = String(req.body?.theme || "Modern").trim();
    const engine = String(req.body?.engine || "auto").trim();

    if (!idea) {
      return res.status(400).json({
        ok: false,
        error: "Please enter an app or game idea."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing in Render environment."
      });
    

    if (!ENGINE_CATALOG[engine]) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported engine selection."
      });
    }

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "You generate working applications. Follow the requested JSON schema exactly."
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: makePrompt({ appName, idea, theme, engine })
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.25,
          maxOutputTokens: 16000
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(502).json({
        ok: false,
        error: data?.error?.message || "AI generation failed."
      });
    }

    const output =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!output) {
      return res.status(502).json({
        ok: false,
        error: "AI returned an empty response. Please try again."
      });
    }

    let generated;

    try {
      generated = JSON.parse(output);
    } catch {
      console.error("Invalid Gemini JSON:", output.slice(0, 500));
      return res.status(502).json({
        ok: false,
        error: "AI returned invalid JSON. Please retry."
      });
    }

    const html = cleanHtml(generated.html);

    if (!html.toLowerCase().includes("<html") ||
        !html.toLowerCase().includes("</html>")) {
      return res.status(502).json({
        ok: false,
        error: "AI did not return a complete HTML document."
      });
    }

    return res.json({
      ok: true,
      appName: generated.appName || appName,
      summary: generated.summary || "Application generated.",
      engine: generated.engine || engine,
      html,
      features: Array.isArray(generated.features)
        ? generated.features
        : []
    });
  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({
      ok: false,
      error: "Application generation failed. Please try again."
    });
  }
});

app.post("/api/edit-app", async (req, res) => {
  try {
    const {
      appName = "My AI App",
      idea = "",
      theme = "Modern",
      instruction = "",
      html = ""
    } = req.body || {};

    if (!String(idea).trim() ||
        !String(instruction).trim() ||
        !String(html).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Idea, edit instruction and existing HTML are required."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing."
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `
Edit the existing application according to the user's instruction.
Keep all unrelated working features.
Return ONLY valid JSON with keys: appName, summary, html, features.
The html value must be a complete standalone HTML document.

App name: ${appName}
Original idea: ${idea}
Theme: ${theme}
Requested edit: ${instruction}

Existing HTML:
${String(html).slice(0, 100000)}
`
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 16000
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: data?.error?.message || "AI edit failed."
      });
    }

    const output =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    const result = JSON.parse(output || "{}");
    const updatedHtml = cleanHtml(result.html);

    if (!updatedHtml.toLowerCase().includes("<html") ||
        !updatedHtml.toLowerCase().includes("</html>")) {
      throw new Error("AI did not return complete HTML.");
    }

    return res.json({
      ok: true,
      appName: result.appName || appName,
      summary: result.summary || "Application updated.",
      html: updatedHtml,
      features: Array.isArray(result.features)
        ? result.features
        : []
    });
  } catch (error) {
    console.error("Edit error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Could not edit the application."
    });
  }
});

app.post("/api/build", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();
    const html = String(req.body?.html || "").trim();

    if (!idea) {
      return res.status(400).json({
        ok: false,
        error: "App idea is required."
      });
    }

    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "GH_ACTIONS_TOKEN is missing in Render."
      });
    }

    if (!html || !html.toLowerCase().includes("</html>")) {
      return res.status(400).json({
        ok: false,
        error: "Generate the application before building its APK."
      });
    }

    // Compress the generated HTML so it can be passed to a
    // compatible GitHub Actions workflow input.
    const appHtmlGzipB64 =
      gzipSync(Buffer.from(html, "utf8")).toString("base64");

    const dispatchUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;

    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        ...GH_HEADERS,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          idea,
          app_name: appName,
          app_html_gzip_b64: appHtmlGzipB64
        }
      })
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("GitHub dispatch error:", details);

      return res.status(502).json({
        ok: false,
        error:
          "GitHub Actions build could not start. Check main.yml inputs.",
        details: details.slice(0, 1000)
      });
    }

    lastBuildRequestedAt = Date.now();

    return res.json({
      ok: true,
      message: "APK build started.",
      appName
    });
  } catch (error) {
    console.error("Build error:", error);
    return res.status(500).json({
      ok: false,
      error: "Could not start the APK build."
    });
  }
});

app.get("/api/build-status", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "GH_ACTIONS_TOKEN is missing."
      });
    }

    const url =
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=10`;

    const response = await fetch(url, {
      headers: GH_HEADERS
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "Could not check GitHub build status."
      });
    }

    const runs = data.workflow_runs || [];
    const run = runs.find(item =>
      new Date(item.created_at).getTime() >=
      lastBuildRequestedAt - 15000
    );

    if (!run) {
      return res.json({
        ok: true,
        status: "waiting",
        message: "Waiting for the APK build to start."
      });
    }

    if (run.status !== "completed") {
      return res.json({
        ok: true,
        status: run.status,
        message: "APK is building."
      });
    }

    if (run.conclusion !== "success") {
      return res.json({
        ok: true,
        status: "failed",
        message: "APK build failed. Open GitHub Actions logs.",
        runUrl: run.html_url
      });
    }

    const artifactResponse = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${run.id}/artifacts`,
      { headers: GH_HEADERS }
    );

    const artifactData = await artifactResponse.json();

    const artifact = (artifactData.artifacts || []).find(item =>
      item.name.toLowerCase() === "myapp-apk" &&
      !item.expired
    );

    if (!artifact) {
      return res.json({
        ok: true,
        status: "completed",
        message: "Build succeeded, but APK artifact was not found.",
        runUrl: run.html_url
      });
    }

    return res.json({
      ok: true,
      status: "success",
      message: "APK build completed.",
      downloadUrl:
        `${BACKEND_URL}/api/apk-download?run_id=${run.id}`,
      runUrl: run.html_url
    });
  } catch (error) {
    console.error("Status error:", error);
    return res.status(500).json({
      ok: false,
      error: "Could not check APK status."
    });
  }
});

app.get("/api/apk-download", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).send("GitHub token is missing.");
    }

    const runId = String(req.query.run_id || "");

    if (!/^\d+$/.test(runId)) {
      return res.status(400).send("Invalid run ID.");
    }

    const artifactsResponse = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`,
      { headers: GH_HEADERS }
    );

    const artifactData = await artifactsResponse.json();

    if (!artifactsResponse.ok) {
      return res.status(502).send("Could not fetch build artifact.");
    }

    const artifact = (artifactData.artifacts || []).find(item =>
      item.name.toLowerCase() === "myapp-apk" &&
      !item.expired
    );

    if (!artifact) {
      return res.status(404).send("APK artifact not found.");
    }

    const zipResponse = await fetch(artifact.archive_download_url, {
      headers: GH_HEADERS,
      redirect: "follow"
    });

    if (!zipResponse.ok) {
      return res.status(502).send("Could not download APK artifact.");
    }

    // The artifact is a ZIP file. This endpoint currently redirects
    // users to GitHub's artifact ZIP; extracting the APK directly
    // requires a ZIP parser and the exact workflow artifact layout.
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Myapp-APK.zip"'
    );
    res.setHeader("Content-Type", "application/zip");

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    return res.status(200).send(zipBuffer);
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).send("APK download failed.");
  }
});

app.listen(PORT, () => {
  console.log(`AI App Builder backend running on port ${PORT}`);
});
