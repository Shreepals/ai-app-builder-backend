
import "dotenv/config";
import express from "express";
import cors from "cors";
import { inflateRawSync } from "node:zlib";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GH_ACTIONS_TOKEN = process.env.GH_ACTIONS_TOKEN || "";

const OWNER = "Shreepals";
const REPO = "ai-app-builder-backend";
const WORKFLOW = "main.yml";
const BACKEND_URL =
  "https://ai-app-builder-backend-1.onrender.com";

let lastBuildRequestedAt = 0;

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28"
};

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Gemini Backend"
  });
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
  const response = await fetch(
    `https://api.github.com${path}`,
    {
      ...options,
      headers: {
        ...GH_HEADERS,
        ...(options.headers || {})
      }
    }
  );

  return response;
}

// Generate a complete app as HTML, not just a written plan.
app.post("/api/generate", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName =
      String(req.body?.appName || "My AI App").trim();
    const theme = String(req.body?.theme || "Modern").trim();

    if (!idea) {
      return res.status(400).json({
        error: "Please enter your app idea."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini API key is not configured in Render."
      });
    }

    const prompt = `
You are an expert full-stack app developer and mobile UI designer.

Create a COMPLETE, usable app based on the user's exact idea.
Do not create a generic calculator or unrelated dashboard.
The app must be specifically designed for the idea below.

APP NAME: ${appName}
APP IDEA: ${idea}
DESIGN THEME: ${theme}

Return ONLY valid JSON with these keys:
{
  "appName": "string",
  "summary": "string",
  "html": "string",
  "features": ["string"]
}

Requirements for html:
1. Provide a complete standalone HTML document.
2. Include all CSS and JavaScript inside the HTML.
3. Make it responsive for Android phones and desktop.
4. Design a polished, modern, complete dashboard for this exact idea.
5. Include a header, navigation, relevant cards, forms, lists,
   buttons and sections that make sense for this app.
6. Use realistic sample data appropriate to the idea.
7. Buttons and forms must work using JavaScript where practical.
8. Add useful interactions, search, filtering, and localStorage
   persistence when appropriate.
9. Do not use placeholder text such as "coming soon" for the
   main features. Implement the main features as far as possible.
10. Do not require external libraries, a server, or an API key
    for the core demo to run.
11. Do not claim that real payments, live prices, login, or
    remote services work unless actually integrated. Use clearly
    identified demo data when real services are unavailable.
12. Use semantic HTML, accessible labels, and touch-friendly controls.
13. The HTML must not be truncated. Keep it self-contained.
14. The summary should briefly explain what was built.
15. features must list the actual implemented features.

The html field must contain the entire runnable HTML source,
including <!DOCTYPE html>, <html>, <head>, <style>,
<body>, and <script> as needed.
Return JSON only, with no Markdown fences.
`;

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Gemini could not generate the app.",
        detail: data?.error?.message || "Unknown Gemini error"
      });
    }

    const output = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!output) {
      return res.status(502).json({
        error: "AI returned an empty response.",
        detail:
          data?.promptFeedback?.blockReason ||
          data?.candidates?.[0]?.finishReason ||
          "Please try again."
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
      return res.status(502).json({
        error: "AI returned invalid JSON. Please try again."
      });
    }

    if (
      typeof result.html !== "string" ||
      !result.html.toLowerCase().includes("<html")
    ) {
      return res.status(502).json({
        error: "AI did not return a complete HTML app. Please try again."
      });
    }

    return res.json({
      ok: true,
      result: {
        appName: result.appName || appName,
        summary: result.summary || "",
        html: result.html,
        features: Array.isArray(result.features)
          ? result.features
          : []
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

// Start an Android APK build using the user's idea.
app.post("/api/build", async (req, res) => {
  try {
    const idea = String(req.body?.idea || "").trim();
    const appName =
      String(req.body?.appName || "My AI App").trim();

    if (!idea) {
      return res.status(400).json({
        error: "Please enter your app idea."
      });
    }

    if (!GH_ACTIONS_TOKEN) {
      return res.status(503).json({
        error: "GitHub Actions token is not configured in Render."
      });
    }

    lastBuildRequestedAt = Date.now();

    const response = await github(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            idea,
            app_name: appName
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

    return res.status(202).json({
      ok: true,
      message: "APK build started.",
      appName
    });
  } catch (error) {
    console.error("Build error:", error);

    return res.status(500).json({
      error: "APK build request failed.",
      detail: error?.message || "Unknown server error"
    });
  }
});

// Check build progress and locate the APK artifact.
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

    const run = runs.find(item =>
      new Date(item.created_at).getTime() >=
      lastBuildRequestedAt - 15000
    );

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
          downloadUrl =
            `${BACKEND_URL}/api/apk-download?run_id=${run.id}`;
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
      message:
        run.status === "completed"
          ? run.conclusion === "success"
            ? artifactFound
              ? "APK is ready to download."
              : "Build succeeded, but the Myapp-APK artifact was not found."
            : "APK build failed."
          : "APK is being built."
    });
  } catch (error) {
    console.error("Build status error:", error);

    return res.status(500).json({
      error: "Could not check APK status.",
      detail: error?.message || "Unknown server error"
    });
  }
});

// Extract the APK from GitHub's ZIP artifact.
app.get("/api/apk-download", async (req, res) => {
  try {
    const runId = String(req.query?.run_id || "").trim();

    if (!/^\d+$/.test(runId)) {
      return res.status(400).json({
        error: "A valid run_id is required."
      });
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

    // Find the APK entry in the ZIP central directory.
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
          return res.status(502).json({
            error: "APK entry in ZIP is invalid."
          });
        }

        const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
        const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);

        const dataStart =
          localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd > zipBuffer.length) {
          return res.status(502).json({
            error: "APK data in ZIP is incomplete."
          });
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

      offset +=
        46 + fileNameLength + extraLength + commentLength;
    }

    if (!apkBuffer) {
      return res.status(404).json({
        error: "No .apk file was found inside the artifact."
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.android.package-archive"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Myapp.apk"'
    );
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
