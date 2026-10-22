
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
  const gamePattern =
    /\b(game|gaming|3d|2d|racing|race|runner|platformer|shooter|puzzle|arcade|football|cricket|car game|bike game|battle|survival|minecraft|gameplay)\b|गेम|खेल|रेसिंग|दौड़|शूटिंग|पहेली|क्रिकेट गेम|कार गेम|बाइक गेम/i;

  const isGame = gamePattern.test(`${appName} ${idea}`);

  return `
You are an expert mobile app developer and UI/UX designer.

APP NAME: ${appName}
USER'S EXACT APP IDEA: ${idea}
DESIGN THEME: ${theme}

Your most important task is to build the actual app requested by the user.
Do not replace the requested app with a generic calculator or unrelated dashboard.
Do not return just a description, wireframe, or a single welcome screen.

${isGame ? `
GAME REQUIREMENTS:
- Build the specific game described by the user.
- Include a start screen, real gameplay, scoring, restart and suitable controls.
- Support touch controls on mobile and keyboard controls where appropriate.
- Use Canvas or CSS/JavaScript for suitable 2D games.
- Use Three.js only when needed for the requested 3D game.
- Do not claim multiplayer or online services work unless implemented.
` : `
APP REQUIREMENTS:
- Build a complete, useful app tailored to the exact user idea.
- Create all major screens and features relevant to that idea.
- Implement navigation so each menu opens its corresponding screen.
- Implement forms, add/edit/delete operations, search, filters and calculations where appropriate.
- Use localStorage for appropriate local data persistence.
- Include realistic sample data that matches the app idea.
- Clearly label demo data. Do not fake live APIs, payments, authentication or cloud services.
`}

MANDATORY MOBILE RESPONSIVENESS:
- Mobile-first design, tested conceptually at widths of 320px, 360px and 390px.
- Must fit Android portrait screens without horizontal scrolling.
- Use a responsive CSS grid and flexbox with min-width: 0.
- Use box-sizing: border-box and max-width: 100% for content.
- On small screens, collapse the desktop sidebar into a top bar with a menu button or a compact navigation drawer.
- The sidebar must not remain permanently open and consume most of the mobile screen.
- Close the mobile navigation drawer after the user selects a menu item.
- Main content must use the full available width on mobile.
- Forms, tables, cards, dialogs and buttons must fit mobile screens.
- Buttons must be touch-friendly, preferably at least 44px high.
- Use responsive typography and spacing.
- Make charts responsive if charts are included.
- Do not hide major features merely to fit the screen.

FUNCTIONALITY:
- Every primary navigation item must open a real corresponding screen.
- Every primary button must perform its advertised action.
- Avoid dead buttons and "coming soon" placeholders for core features.
- Keep all HTML, CSS and JavaScript in one standalone HTML file.
- Do not use JavaScript import statements or ES modules in the HTML.
- Use semantic HTML and accessible labels.
- Handle empty fields and invalid input gracefully.
- Do not claim a backend feature works if it has not been implemented.

OUTPUT:
Return a complete runnable HTML document with <!DOCTYPE html>, <html>, <head>, <style>, <body> and JavaScript.
The app must be suitable for loading inside an Android WebView.
The generated HTML must be self-contained apart from explicitly needed external libraries.
Return ONLY valid JSON matching this schema:
{
  "appName": "string",
  "summary": "string",
  "html": "string",
  "features": ["string"]
}
The html property must contain the complete HTML source.
The features array must only list features actually implemented.
No Markdown fences around the JSON.
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
