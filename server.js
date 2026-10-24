
import "dotenv/config";
import express from "express";
import cors from "cors";
import { inflateRawSync, gzipSync } from "node:zlib";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GH_ACTIONS_TOKEN = process.env.GH_ACTIONS_TOKEN || "";

const OWNER = "Shreepals";
const REPO = "ai-app-builder-backend";
const WORKFLOW = "main.yml";
const BACKEND_URL = "https://ai-app-builder-backend-1.onrender.com";

let lastBuildRequestedAt = 0;
let lastBuildRunId = null;

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28"
};

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

async function github(path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...GH_HEADERS, ...(options.headers || {}) }
  });
}

function getAppPrompt({ appName, idea, theme }) {
  return `
You are a professional game development studio, senior game programmer,
3D artist, gameplay designer and mobile UI/UX engineer.

APP NAME: ${appName}
EXACT GAME IDEA: ${idea}
THEME: ${theme}

YOUR MISSION:
Create a complete, playable, polished mobile game matching the EXACT
game idea supplied by the user. Do not make a generic demo, blank screen,
red rectangle game, static mockup, or unrelated game.

1. IDENTIFY THE GAME TYPE
First understand the user's idea and choose appropriate mechanics:
- Racing: drivable cars, road, traffic, steering, speed, collisions.
- Cricket: bat, ball, bowler, batting controls, runs, wickets and overs.
- Football: players, ball, goal, movement, shooting and score.
- Shooting: player, enemies, aiming, firing, health and waves.
- Endless runner: animated character, obstacles, jumping, sliding and score.
- Platformer: character, platforms, movement, jumping and levels.
- Puzzle: real puzzle rules, selectable pieces, validation and levels.
- Other games: create mechanics suitable for that specific idea.
Never force every game to become a racing game.

2. COMPLETE GAME DASHBOARD
Create a professional home screen with:
- Original game logo and game title.
- Play button that actually starts gameplay.
- How to Play / Instructions.
- Settings and sound toggle when appropriate.
- Best score and current progress.
- Pause and Resume.
- Restart and Home buttons.
- Game Over or Victory screen.
- Final score and Replay button.
All buttons must work. Do not display fake controls.

3. REAL GAME WORLD
Create an actual game scene with a background, environment,
player, interactive objects, obstacles or opponents as required.
Use animation and meaningful movement.
Use real collision detection and rules for winning or losing.
Update the score based on actual gameplay.
Include increasing difficulty or levels where appropriate.
Create multiple visible game objects, not just one rectangle.
Add suitable sound effects when practical, with a mute option.

4. 3D REQUIREMENTS
When the requested idea calls for a 3D game, create a real 3D scene:
- Use Three.js with its browser-compatible global THREE API.
- Load Three.js with a regular script tag, not import statements.
- Create a renderer, scene, perspective camera and lighting.
- Build a ground/environment, player model, and multiple game objects
  using 3D geometry and materials.
- Use shadows where practical, perspective and camera movement.
- Animate the world and objects using requestAnimationFrame.
- Resize the renderer when the screen orientation or size changes.
- Display a useful loading/error message if the 3D library cannot load.
- Do not pretend a flat 2D rectangle is a 3D model.
For games that do not need 3D, build suitable polished 2D gameplay.

For a 3D car racing game specifically:
- Show a recognisable 3D car with body, windows and four wheels.
- Show a road with lane markings, road edges and scenery.
- Add multiple opponent cars that move toward or past the player.
- Add steering, speed, acceleration or braking where suitable.
- Steering must visibly change the player's car position.
- Add traffic collisions, score/distance and game-over logic.
- Use a following camera and a convincing sense of motion.

5. MOBILE ANDROID CONTROLS
The game must work on a touch screen inside Android WebView.
- Make controls large and easy to press with thumbs.
- Use pointerdown, pointerup, pointercancel and pointerleave
  for press-and-hold controls, with reliable release handling.
- Use touch-action:none on the actual game controls.
- Support continuous steering or movement while the control is held.
- Support keyboard controls for desktop testing when appropriate.
- Prevent arrow keys from scrolling the page during gameplay.
- Clear held controls when the app loses focus or becomes hidden.
- Make the entire interface responsive to narrow phone screens.
- Avoid horizontal scrolling and controls hidden behind system bars.

6. GAME STATE AND FUNCTIONALITY
Implement clear states: home, playing, paused, gameover and victory
where appropriate.
The game loop must stop or pause correctly when the game is paused.
Restart must reset score, player position, enemies, obstacles,
timers and all other relevant game state.
Home must return to the game dashboard.
Replay must start a fresh game.
Prevent multiple animation loops from starting accidentally.
Every visible button must have a working event handler.
Do not leave placeholder buttons or unfinished main features.

7. VISUAL QUALITY
Use a polished game UI, attractive colours, gradients, depth,
consistent typography, smooth transitions and readable score panels.
Create a game logo using inline SVG or CSS.
Use a clear HUD for score, health, timer, level or speed as appropriate.
Make the game look like a real mobile game, not a plain HTML form.
Keep the dashboard and gameplay visually distinct.
Make the game playable on a 320px-wide phone.

8. TECHNICAL REQUIREMENTS
- Return one complete standalone HTML document.
- Put all CSS inside a style element.
- Put all JavaScript inside a script element.
- Do not use JavaScript modules or import statements.
- Do not use a backend unless explicitly required by the idea.
- Use localStorage for best score and settings where appropriate.
- Do not claim real multiplayer, live data, online accounts or payments
  unless actually implemented.
- Use external libraries only where necessary and handle load failures.
- Ensure the code works inside an Android WebView.
- Do not omit code with phrases like "rest of code here".
- Do not return a mockup instead of a playable game.

9. FINAL SELF-CHECK
Before returning the HTML, check that:
- The home screen and Play button work.
- The actual player/game objects are visible.
- The requested game mechanics are implemented.
- Touch controls change the game state or player position.
- Collision, scoring and win/lose conditions work where appropriate.
- Pause, Resume, Restart, Home and Replay work.
- All referenced element IDs exist.
- Event listeners are attached correctly.
- The game adapts to mobile screen sizes.
- No main feature is just a decorative button.

10. OUTPUT FORMAT
Return ONLY valid JSON in this exact structure:
{
  "appName": "The game name",
  "summary": "A short description of the completed game",
  "html": "The complete HTML document",
  "features": ["Implemented feature 1", "Implemented feature 2"]
}
Escape newlines and quotation marks correctly inside JSON strings.
The html field must contain the complete runnable HTML.
Do not wrap the JSON in Markdown fences.
`;
}

app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();
    const theme = String(req.body?.theme || "Modern").trim();

    if (!idea) {
      return res.status(400).json({ error: "Please enter your app idea." });
    }
    if (idea.length > 12000 || appName.length > 100) {
      return res.status(400).json({ error: "App name or idea is too long." });
    }
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini API key is not configured in Render."
      });
    }

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: getAppPrompt({ appName, idea, theme }) }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.25,
          maxOutputTokens: 24000
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data?.error?.message || "Unknown Gemini error";
      console.error("Gemini API error:", response.status, detail);
      return res.status(502).json({
        error: `Gemini error (${response.status}): ${detail}`
      });
    }

    const output = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!output) {
      return res.status(502).json({
        error: "AI returned an empty response. Please try again.",
        detail: data?.promptFeedback?.blockReason ||
          data?.candidates?.[0]?.finishReason || ""
      });
    }

    let result;
    try {
      const cleaned = output
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("Invalid Gemini JSON response");
      return res.status(502).json({
        error: "AI returned invalid JSON. Please try again."
      });
    }

    if (
      typeof result.html !== "string" ||
      !/<html[\s>]/i.test(result.html) ||
      !/<\/html>/i.test(result.html)
    ) {
      return res.status(502).json({
        error: "AI did not return a complete HTML app. Please generate again."
      });
    }

    return res.json({
      ok: true,
      appName: String(result.appName || appName),
      summary: String(result.summary || ""),
      html: result.html,
      features: Array.isArray(result.features) ? result.features : [],
      result: {
        appName: String(result.appName || appName),
        summary: String(result.summary || ""),
        html: result.html,
        features: Array.isArray(result.features) ? result.features : []
      }
    });
  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({
      error: "App generation failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});
app.post("/api/edit-app", async (req, res) => {
  try {
    const appName = String(req.body?.appName || "My App").trim();
    const idea = String(req.body?.idea || "").trim();
    const theme = String(req.body?.theme || "Modern").trim();
    const instruction = String(req.body?.instruction || "").trim();
    const html = String(req.body?.html || "");

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on the server."
      });
    }

    if (!instruction) {
      return res.status(400).json({
        error: "Please describe what you want to change."
      });
    }

    if (!html || !html.includes("<")) {
      return res.status(400).json({
        error: "Existing app HTML is missing."
      });
    }

    const prompt = `
You are an expert web app developer.

Edit the existing app according to the user's instructions.

APP NAME:
${appName}

ORIGINAL APP IDEA:
${idea}

THEME:
${theme}

USER'S REQUESTED CHANGES:
${instruction}

EXISTING APP HTML:
${html}

REQUIREMENTS:
1. Return the COMPLETE updated HTML document, not partial code.
2. Keep all existing working features unless the user requests changing them.
3. Implement the requested changes in the actual interface and functionality.
4. Make the dashboard professional, responsive and mobile-friendly.
5. Use HTML, CSS and JavaScript that work inside an Android WebView.
6. Do not use Markdown fences.
7. Do not include explanations outside the JSON.
8. Return valid JSON with these fields:
{
  "appName": "App name",
  "summary": "Short description of changes",
  "html": "Complete HTML document as a string",
  "features": ["Feature 1", "Feature 2"]
}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(GEMINI_MODEL) +
        ":generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
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
            temperature: 0.3
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini edit error:", data);
      return res.status(502).json({
        error:
          data?.error?.message ||
          "AI could not edit the app. Please try again."
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");

    if (!text) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "AI returned invalid JSON. Please try again."
      });
    }

    if (
      typeof result.html !== "string" ||
      !result.html.toLowerCase().includes("<html")
    ) {
      return res.status(502).json({
        error: "AI did not return a complete HTML app."
      });
    }

    return res.json({
      ok: true,
      result: {
        appName: String(result.appName || appName),
        summary: String(result.summary || "App updated"),
        html: result.html,
        features: Array.isArray(result.features)
          ? result.features
          : []
      }
    });
  } catch (error) {
    console.error("Edit app error:", error);
    return res.status(500).json({
      error: "App editing failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.post("/api/build", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();
    const html = String(req.body?.html || "").trim();

    if (!idea) {
      return res.status(400).json({ error: "Please enter your app idea." });
    }
    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured in Render."
      });
    }
    if (!html) {
      return res.status(400).json({
        error: "Generated app HTML is missing. Generate the app before building APK."
      });
    }
    if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
      return res.status(400).json({
        error: "The supplied HTML app is incomplete."
      });
    }

    const compressedHtml = gzipSync(Buffer.from(html, "utf8")).toString("base64");

    if (compressedHtml.length > 50000) {
      return res.status(413).json({
        error: "This app is too large to send directly to the build workflow. A file-upload method is needed."
      });
    }

    const response = await github(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            idea: idea.slice(0, 12000),
            app_name: appName.slice(0, 100),
            app_html_gzip_b64: compressedHtml
          }
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({
        error: "Could not start APK build.",
        detail
      });
    }

    lastBuildRequestedAt = Date.now();
    lastBuildRunId = null;

    return res.status(202).json({
      ok: true,
      message: "APK build started.",
      appName,
      sameHtmlProvided: true
    });
  } catch (error) {
    console.error("Build error:", error);
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
        error: "GitHub Actions token is not configured."
      });
    }

    const response = await github(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`
    );
    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Could not check build status.",
        detail: data?.message || "GitHub API error"
      });
    }

    const runs = data.workflow_runs || [];
    let run = lastBuildRunId
      ? runs.find(item => String(item.id) === String(lastBuildRunId))
      : null;

    if (!run && lastBuildRequestedAt) {
      run = runs.find(item =>
        new Date(item.created_at).getTime() >= lastBuildRequestedAt - 15000
      );
      if (run) lastBuildRunId = run.id;
    }

    if (!run) {
      return res.json({
        ok: true,
        status: "queued",
        conclusion: null,
        message: "Waiting for GitHub Actions to start the build.",
        downloadUrl: null
      });
    }

    let downloadUrl = null;
    let artifactFound = false;

    if (run.status === "completed" && run.conclusion === "success") {
      const artifactResponse = await github(
        `/repos/${OWNER}/${REPO}/actions/runs/${run.id}/artifacts`
      );
      const artifactData = await artifactResponse.json();

      if (artifactResponse.ok) {
        const artifact = (artifactData.artifacts || []).find(item =>
          item.name === "Myapp-APK" && !item.expired
        );
        if (artifact) {
          artifactFound = true;
          downloadUrl = `${BACKEND_URL}/api/apk-download?run_id=${run.id}`;
        }
      }
    }

    return res.json({
      ok: true,
      runId: run.id,
      status: run.status,
      conclusion: run.conclusion,
      runUrl: run.html_url,
      artifactFound,
      downloadUrl,
      message: run.status !== "completed"
        ? "APK is being built."
        : run.conclusion === "success"
          ? artifactFound
            ? "APK is ready to download."
            : "Build succeeded, but Myapp-APK artifact was not found."
          : "APK build failed."
    });
  } catch (error) {
    console.error("Build status error:", error);
    return res.status(500).json({
      error: "Could not check APK status.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.get("/api/apk-download", async (req, res) => {
  try {
    const runId = String(req.query?.run_id || "").trim();

    if (!/^\d+$/.test(runId)) {
      return res.status(400).json({ error: "A valid run_id is required." });
    }
    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured."
      });
    }

    const artifactResponse = await github(
      `/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`
    );
    const artifactData = await artifactResponse.json();

    if (!artifactResponse.ok) {
      return res.status(502).json({
        error: "Could not locate APK artifact.",
        detail: artifactData?.message || "GitHub API error"
      });
    }

    const artifact = (artifactData.artifacts || []).find(item =>
      item.name === "Myapp-APK" && !item.expired
    );

    if (!artifact) {
      return res.status(404).json({
        error: "Myapp-APK artifact not found or expired."
      });
    }

    const zipResponse = await github(
      `/repos/${OWNER}/${REPO}/actions/artifacts/${artifact.id}/zip`
    );

    if (!zipResponse.ok) {
      return res.status(502).json({
        error: "Could not download APK artifact from GitHub."
      });
    }

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    let offset = 0;
    let apkBuffer = null;

    while (offset + 46 <= zipBuffer.length) {
      if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) {
        offset++;
        continue;
      }

      const method = zipBuffer.readUInt16LE(offset + 10);
      const compressedSize = zipBuffer.readUInt32LE(offset + 20);
      const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
      const extraLength = zipBuffer.readUInt16LE(offset + 30);
      const commentLength = zipBuffer.readUInt16LE(offset + 32);
      const localOffset = zipBuffer.readUInt32LE(offset + 42);
      const fileName = zipBuffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf8");

      if (fileName.toLowerCase().endsWith(".apk")) {
        if (
          localOffset + 30 > zipBuffer.length ||
          zipBuffer.readUInt32LE(localOffset) !== 0x04034b50
        ) {
          return res.status(502).json({ error: "APK entry in ZIP is invalid." });
        }

        const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
        const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd > zipBuffer.length) {
          return res.status(502).json({ error: "APK data in ZIP is incomplete." });
        }

        const compressed = zipBuffer.subarray(dataStart, dataEnd);

        if (method === 0) {
          apkBuffer = Buffer.from(compressed);
        } else if (method === 8) {
          apkBuffer = inflateRawSync(compressed);
        } else {
          return res.status(502).json({
            error: `Unsupported ZIP compression method: ${method}`
          });
        }
        break;
      }

      offset += 46 + fileNameLength + extraLength + commentLength;
    }

    if (!apkBuffer) {
      return res.status(404).json({
        error: "No .apk file was found inside the artifact."
      });
    }

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="Myapp.apk"');
    res.setHeader("Content-Length", apkBuffer.length);
    return res.send(apkBuffer);
  } catch (error) {
    console.error("APK download error:", error);
    return res.status(500).json({
      error: "APK download failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log("AI App Builder backend running on port " + port);
});
