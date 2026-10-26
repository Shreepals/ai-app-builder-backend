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

function makePrompt({ idea, appName, theme = "Modern", engine = "auto" }) {
  const userIdea = String(idea || "").trim();
  const name = String(appName || "My AI App").trim();
  const design = String(theme || "Modern");

  const gamePattern =
    /\b(game|gaming|3d|2d|racing|race|car game|bike game|football|soccer|cricket|shooting|shooter|adventure|open world|platformer|runner|puzzle|chess|cards|survival|horror|fighting|battle|simulation|tycoon)\b|गेम|खेल|रेसिंग|क्रिकेट|फुटबॉल|शूटिंग|एडवेंचर/i;

  const isGame = gamePattern.test(userIdea);
  const chosenEngine = isGame ? "threejs" : engine;

  return `
You are a senior product designer, UI/UX expert,
frontend engineer, and interactive application developer.

Your job is to transform the user's exact idea into a complete,
polished, useful, functional HTML application.

USER APP NAME:
${name}

USER'S EXACT IDEA:
${userIdea}

DESIGN STYLE:
${design}

APPLICATION TYPE:
${isGame ? "GAME" : "APP OR WEBSITE"}

REQUESTED ENGINE:
${chosenEngine}

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON with these fields:

{
  "appName": "string",
  "summary": "string",
  "features": ["string"],
  "engine": "string",
  "html": "complete standalone HTML document"
}

The html field must contain the entire HTML document.
Do not return a partial page, explanation, Markdown, or code fences.
Escape JSON strings correctly.

==================================================
1. BUILD THE ACTUAL USER IDEA
==================================================

First understand exactly what the user wants.

Identify:
- The application's purpose.
- Its intended users.
- The main tasks users need to complete.
- All important screens.
- All necessary controls and workflows.
- The data the application needs.
- The appropriate visual style.

Do not replace the user's idea with a calculator,
generic dashboard, unrelated demo, or a landing page only.

Create the application that was requested.

Do not invent unnecessary features that distract from
the application's main purpose.

==================================================
2. COMPLETE PROFESSIONAL INTERFACE
==================================================

Create a complete and polished interface with:

- A professional header and application name.
- Logo or a simple CSS/SVG logo appropriate to the idea.
- Navigation menu with working navigation.
- Sidebar on desktop when appropriate.
- Mobile navigation or a usable mobile menu.
- Main dashboard and all important sections.
- Cards, lists, tables, forms or panels appropriate to the idea.
- Search and filters where useful.
- Settings and profile screens when relevant.
- Helpful empty states and confirmation messages.
- A consistent footer when appropriate.

Do not force a sidebar into games or simple utilities
where it would damage the user experience.

Every major feature implied by the idea must have
a visible place in the interface.

Do not leave large blank areas or unexplained empty panels.

==================================================
3. VISUAL DESIGN QUALITY
==================================================

Use a consistent professional design system.

Include:
- A carefully chosen color palette.
- Readable typography and clear visual hierarchy.
- Consistent spacing, padding and alignment.
- Attractive cards and section headings.
- Appropriate borders, shadows and rounded corners.
- Good contrast and accessible text sizes.
- Useful icons or inline SVG icons where suitable.
- Smooth, restrained transitions and hover states.
- Loading, success, error and empty states where necessary.

Make the interface look like a finished product,
not a basic school project or an unstyled HTML page.

Use CSS variables for the theme.

Do not make every element a card.
Avoid excessive gradients, oversized headings,
random emojis and unnecessary decoration.

==================================================
4. RESPONSIVE MOBILE AND DESKTOP
==================================================

The app must work on Android mobile browsers
and on desktop screens.

Requirements:
- Use the viewport meta tag.
- Use responsive CSS and appropriate media queries.
- Avoid horizontal overflow.
- Make buttons large enough for touch.
- Ensure menus fit on small screens.
- Keep text readable on mobile.
- Make forms and tables usable on narrow screens.
- Handle portrait and landscape orientation where useful.

Test the layout conceptually at narrow and wide widths.

==================================================
5. FUNCTIONAL BUTTONS AND INTERACTIONS
==================================================

Every visible interactive control must work.

Examples:
- Navigation opens the correct section.
- Forms validate their input.
- Submit buttons process the entered data.
- Add buttons create items.
- Edit buttons update items.
- Delete buttons remove items after confirmation.
- Search filters relevant content.
- Tabs switch the displayed panel.
- Toggles actually change settings.
- Save buttons provide feedback and save data locally
  when local persistence is suitable.
- Reset buttons reset the relevant data.
- Modal dialogs can open and close.
- Menus can open and close.
- Important actions provide visible feedback.

Do not use href="#" as a fake interaction.
Do not create buttons that do nothing.
Do not show success messages when an action failed.

For a demo that cannot connect to a real backend,
implement a working local demonstration and clearly
identify any demo-only data.

==================================================
6. REAL APPLICATION WORKFLOWS
==================================================

Build the workflows specific to the requested idea.

For a shopping app, include suitable product browsing,
search, product details, cart and checkout demonstration.

For a learning app, include courses, lessons, progress
and useful learning interactions.

For a finance dashboard, include transaction entry,
filters, summaries and clearly labelled sample data.

For a booking app, include available options, date selection,
form validation and booking confirmation demonstration.

For a social app, include profiles, posts, interactions
and appropriate navigation.

These are examples only. Do not force them into other ideas.

If the idea needs authentication, payments, cloud storage,
live data or external APIs, build the appropriate UI
and explain which backend credentials or services are required.
Never pretend a frontend-only demo provides real security,
real payments or live external data.

==================================================
7. GAMES: DETECT THE CORRECT GENRE
==================================================

If the idea describes a game, create a playable game,
not merely a dashboard about a game.

Select mechanics based on the user's idea.

RACING:
Vehicle steering, acceleration, braking, road or track,
obstacles, collision detection and race results.

FOOTBALL:
Player movement, ball control, kicking, goal detection,
opponents and score.

CRICKET:
Batting timing, bowling interaction, wickets, runs,
overs and match results.

SHOOTING:
Aiming, firing, targets, hit detection, health
and game-over logic.

PLATFORMER:
Movement, jumping, gravity, platforms, hazards,
collectibles and levels.

ENDLESS RUNNER:
Running, lane changes, jumping, obstacles,
collectibles and distance scoring.

PUZZLE OR BOARD GAME:
Actual puzzle rules, valid moves, win conditions,
restart and hints when appropriate.

ADVENTURE:
Character movement, environment, objectives,
collectibles and interactions.

SURVIVAL:
Resources, health, threats, objectives and progression.

FIGHTING:
Movement, attacks, blocking, health and round results.

SIMULATION:
Interactive systems, meaningful decisions,
resources, upgrades and progression.

For other genres, infer mechanics from the idea itself.
For games combining genres, combine suitable mechanics.

Do not make every game a car racing game.

==================================================
8. 3D AND 2D GAME IMPLEMENTATION
==================================================

If the user specifically asks for 2D:
- Build a genuine 2D game using Canvas or DOM.
- Implement the requested mechanics and collision rules.
- Do not force 3D into a 2D request.

For 3D games:
- Use Three.js.
- Create a scene, camera, renderer and lighting.
- Create appropriate terrain, environment and game objects.
- Add suitable player models and animations when feasible.
- Implement movement and collision detection.
- Include keyboard and mobile touch controls.
- Include start, pause, resume and restart.
- Include relevant score, health, timer or progress.
- Implement the game's actual objective.
- Keep rendering responsive on mobile devices.
- Handle missing network access or library load failures.

Avoid making every character, building, car or object
a plain colored cube.

A 3D game must have actual 3D rendering and gameplay.
A 2D game must have actual 2D gameplay.

Do not claim that complex commercial-quality graphics
or complete multiplayer features exist unless implemented.

==================================================
9. TECHNICAL REQUIREMENTS
==================================================

Return a complete standalone HTML document containing:

<!DOCTYPE html>
<html>
<head>
<style>
  /* Complete responsive CSS */
</style>
</head>
<body>
  <!-- Complete app interface -->
  <script>
    /* Complete working JavaScript */
  </script>
</body>
</html>

Use semantic HTML and maintainable JavaScript.

Keep required CSS and JavaScript inside the HTML file.

Do not require a separate build step for the HTML.

Avoid unnecessary external libraries.
If a library is necessary, load it from a suitable CDN
and handle load failures gracefully.

The basic interface should still explain the problem
if a required online service cannot be reached.

Use localStorage when suitable for saving non-sensitive
demo settings or local demo data.

Never put API secrets, passwords or private tokens in frontend code.

Avoid fake live data, fake authentication and fake payment processing.

==================================================
10. COMPLETENESS CHECK BEFORE RETURNING
==================================================

Before returning the result, verify that:

- The document includes <!DOCTYPE html>.
- The HTML has opening and closing html tags.
- The head and body sections are present.
- CSS is complete.
- JavaScript is complete.
- The actual requested features are implemented.
- All visible buttons have real actions.
- Navigation and forms work.
- Mobile layout has been considered.
- There are no unfinished placeholders.
- Game mechanics match the requested game genre.
- The result is one complete HTML document.

If output length is becoming a problem, prioritize a smaller,
fully working application over a large, broken application.

Do not claim an unimplemented feature is complete.

Return ONLY the required JSON.
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
