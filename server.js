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

function isCarRacingIdea(idea) {
  return /\b(car|cars|racing|race|racer|driving|traffic)\b|कार|रेसिंग|रेस|गाड़ी|गाडियां|गाड़ियां|वाहन|ड्राइविंग/i.test(idea);
}

function make3DRacingGame(appName, theme) {
  const safeName = String(appName || "3D Racing").replace(/[<>&"]/g, "");
  const safeTheme = String(theme || "Modern").replace(/[<>&"]/g, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${safeName}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07111f;color:white;font-family:Arial,sans-serif;touch-action:none}
#game{position:fixed;inset:0}canvas{display:block;width:100%;height:100%}
.hud{position:fixed;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;gap:8px;pointer-events:none}
.panel{background:#07111fe8;border:1px solid #ffffff30;border-radius:12px;padding:10px 14px;min-width:84px}
.small{font-size:11px;color:#a9c5dc}.value{font-size:21px;font-weight:800;margin-top:3px}
.buttons{position:fixed;bottom:20px;left:0;right:0;display:flex;justify-content:space-between;align-items:end;padding:0 20px}
.group{display:flex;gap:12px}.control{width:68px;height:68px;border:1px solid #ffffff70;border-radius:20px;background:#102a43dd;color:white;font-size:26px;font-weight:bold;touch-action:none;user-select:none}
.control:active{background:#1685e8}.action{width:48px;height:42px;border:0;border-radius:10px;background:#164d76;color:white;font-weight:bold;pointer-events:auto}
.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:#04101acc;z-index:5}
.card{width:min(420px,100%);padding:28px 22px;text-align:center;border:1px solid #ffffff35;border-radius:24px;background:linear-gradient(145deg,#102c49,#07111f);box-shadow:0 20px 80px #0008}
h1{font-size:clamp(30px,8vw,48px);margin:0 0 10px}p{color:#c3d8e8;line-height:1.5}
.play{width:100%;padding:16px;border:0;border-radius:13px;background:linear-gradient(90deg,#0879e8,#10b8c8);color:white;font-size:18px;font-weight:800;margin-top:10px}
.hidden{display:none!important}.hint{position:fixed;bottom:102px;left:0;right:0;text-align:center;font-size:12px;color:#d1e3f2;pointer-events:none}
</style>
</head>
<body>
<div id="game"></div>
<div class="hud">
 <div class="panel"><div class="small">DISTANCE</div><div class="value" id="distance">0 m</div></div>
 <div class="panel"><div class="small">SPEED</div><div class="value" id="speed">0 km/h</div></div>
 <div class="panel"><div class="small">SCORE</div><div class="value" id="score">0</div></div>
 <button class="action" id="pause">Ⅱ</button>
</div>
<div class="hint hidden" id="hint">Hold ◀ ▶ to steer · ▲ to accelerate</div>
<div class="buttons">
 <div class="group">
  <button class="control" id="left">◀</button>
  <button class="control" id="right">▶</button>
 </div>
 <div class="group">
  <button class="control" id="brake">▼</button>
  <button class="control" id="gas">▲</button>
 </div>
</div>
<div class="overlay" id="menu">
 <div class="card">
  <div style="font-size:12px;letter-spacing:4px;color:#54d8ff">3D ARCADE RACING</div>
  <h1 id="title"></h1>
  <p id="message">Drive, avoid traffic and travel as far as you can. Collisions end the race.</p>
  <p>Controls: ◀ ▶ steer · ▲ accelerate · ▼ brake</p>
  <button class="play" id="start">START RACE</button>
 </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>
<script>
(function(){
const title=${JSON.stringify(safeName)};
document.getElementById('title').textContent=title;
let scene,camera,renderer,player,clock,roadLines=[],traffic=[],decor=[];
let running=false,paused=false,over=false;
let lane=0,speed=0,distance=0,score=0,spawn=0;
const held={left:false,right:false,gas:false,brake:false};
const el=id=>document.getElementById(id);
function material(color,roughness=.8){return new THREE.MeshStandardMaterial({color,roughness})}
function box(parent,w,h,d,mat,x,y,z){
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
 m.position.set(x,y,z);parent.add(m);return m;
}
function makeCar(color){
 const g=new THREE.Group();
 const body=material(color,.35),glass=material(0x9bd9f5,.22);
 box(g,1.65,.48,3.1,body,0,.58,0);
 box(g,1.22,.55,1.35,body,0,1.03,-.22);
 box(g,1.08,.4,1.2,glass,0,1.08,-.23);
 const tire=material(0x111318);
 for(const x of [-.88,.88])for(const z of [-.98,.98]){
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.2,16),tire);
  wheel.rotation.z=Math.PI/2;wheel.position.set(x,.33,z);g.add(wheel);
 }
 const light=material(0xfff2bd);
 box(g,.36,.13,.06,light,-.5,.62,1.57);
 box(g,.36,.13,.06,light,.5,.62,1.57);
 return g;
}
function setup(){
 if(!window.THREE){el('message').textContent='3D engine could not load. Check internet and reload.';return false}
 scene=new THREE.Scene();scene.background=new THREE.Color(0x8cc9f0);scene.fog=new THREE.Fog(0x8cc9f0,35,145);
 camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,250);
 camera.position.set(0,5.5,10);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
 renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 el('game').replaceChildren(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xe8f7ff,0x45613b,2));
 const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(-8,15,7);sun.castShadow=true;scene.add(sun);
 const grass=material(0x438d47),asphalt=material(0x343b46),white=material(0xffffff),yellow=material(0xffd34e);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,250),grass);ground.rotation.x=-Math.PI/2;ground.position.set(0,-.12,-70);ground.receiveShadow=true;scene.add(ground);
 box(scene,10,.08,240,asphalt,0,-.03,-80);
 box(scene,.18,.09,240,white,-5,-.005,-80);box(scene,.18,.09,240,white,5,-.005,-80);
 for(let z=12;z>-200;z-=8){
  for(let x of [-1.67,1.67]){
   const line=box(scene,.09,.04,3,yellow,x,.025,z);roadLines.push(line);
  }
 }
 const treeMat=material(0x23663c),trunkMat=material(0x68452b);
 for(let z=15;z>-190;z-=9)for(let side of [-1,1]){
  const x=side*(7+Math.random()*8);
  const t=new THREE.Group();
  box(t,.35,1.4,.35,trunkMat,0,.7,0);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(.9,2.5,7),treeMat);crown.position.y=2.3;t.add(crown);
  t.position.set(x,0,z);scene.add(t);decor.push(t);
 }
 player=makeCar(0xe52c38);player.position.set(0,0,3);scene.add(player);
 for(let i=0;i<4;i++)addTraffic(-35-i*35);
 clock=new THREE.Clock();return true;
}
function addTraffic(z){
 const colors=[0x1687ff,0xffc928,0x8b54db,0xf0f0f0,0x19b98b];
 const car=makeCar(colors[Math.floor(Math.random()*colors.length)]);
 const l=[-3.3,0,3.3][Math.floor(Math.random()*3)];
 car.position.set(l,0,z);scene.add(car);traffic.push({car,lane:l,passed:false});
}
function reset(){
 lane=0;speed=0;distance=0;score=0;spawn=0;over=false;paused=false;
 player.position.x=0;traffic.forEach((t,i)=>{t.lane=[-3.3,0,3.3][Math.floor(Math.random()*3)];t.car.position.set(t.lane,0,-35-i*38);t.passed=false});
 roadLines.forEach((o,i)=>{o.position.z=12-Math.floor(i/2)*8});
 decor.forEach((o,i)=>{o.position.z=15-Math.floor(i/2)*9});
 updateHud();
}
function updateHud(){
 el('distance').textContent=Math.floor(distance)+' m';
 el('speed').textContent=Math.round(speed*22)+' km/h';
 el('score').textContent=Math.floor(score);
}
function finish(){
 running=false;over=true;
 el('message').textContent='Race over! Distance: '+Math.floor(distance)+' m · Score: '+Math.floor(score)+'. Try again and avoid traffic.';
 el('start').textContent='RACE AGAIN';el('menu').classList.remove('hidden');
}
function frame(){
 requestAnimationFrame(frame);
 const dt=Math.min(clock?clock.getDelta():.016,.04);
 if(running&&!paused&&!over){
  const target=held.gas?1:held.brake?.12:.58;
  speed+=(target-speed)*dt*(held.gas?1.4:held.brake?2.8:.4);
  if(held.left)lane-=dt*4.3;if(held.right)lane+=dt*4.3;
  lane=Math.max(-3.45,Math.min(3.45,lane));
  player.position.x+=(lane-player.position.x)*Math.min(1,dt*9);
  player.rotation.z=(lane-player.position.x)*-.06;
  const travel=(8+speed*37)*dt;distance+=travel*.65;score+=travel*.8;
  roadLines.forEach(o=>{o.position.z+=travel;if(o.position.z>15)o.position.z-=224});
  decor.forEach(o=>{o.position.z+=travel;if(o.position.z>18)o.position.z-=207});
  spawn+=dt;
  traffic.forEach(t=>{
   t.car.position.z+=travel*(.8+speed*.25);
   t.car.position.x+=(t.lane-t.car.position.x)*dt*1.5;
   if(!t.passed&&t.car.position.z>player.position.z){t.passed=true;score+=100}
   if(Math.abs(t.car.position.x-player.position.x)<1.35&&Math.abs(t.car.position.z-player.position.z)<2.3){finish()}
   if(t.car.position.z>12){t.car.position.z=-150-Math.random()*45;t.lane=[-3.3,0,3.3][Math.floor(Math.random()*3)];t.car.position.x=t.lane;t.passed=false}
  });
  if(spawn>4.5){spawn=0;const t=traffic[Math.floor(Math.random()*traffic.length)];if(t){t.car.position.z=-155-Math.random()*25;t.lane=[-3.3,0,3.3][Math.floor(Math.random()*3)];t.car.position.x=t.lane;t.passed=false}}
  camera.position.x+=(player.position.x*.42-camera.position.x)*dt*2.2;
  camera.lookAt(player.position.x*.25,1,-7);
  updateHud();
 }
 if(renderer&&scene&&camera)renderer.render(scene,camera);
}
['left','right','gas','brake'].forEach(id=>{
 const key=id;
 const b=el(id);
 b.addEventListener('pointerdown',e=>{e.preventDefault();held[key]=true;b.setPointerCapture?.(e.pointerId)});
 ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>held[key]=false));
});
addEventListener('keydown',e=>{
 const map={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'gas',w:'gas',ArrowDown:'brake',s:'brake'};
 if(map[e.key]){e.preventDefault();held[map[e.key]]=true}
});
addEventListener('keyup',e=>{
 const map={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'gas',w:'gas',ArrowDown:'brake',s:'brake'};
 if(map[e.key])held[map[e.key]]=false;
});
addEventListener('blur',()=>Object.keys(held).forEach(k=>held[k]=false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)Object.keys(held).forEach(k=>held[k]=false)});
el('start').onclick=()=>{
 if(!renderer&&!setup())return;
 reset();running=true;el('menu').classList.add('hidden');el('start').textContent='START RACE';
};
el('pause').onclick=()=>{
 if(!running)return;paused=!paused;
 el('menu').classList.toggle('hidden',!paused);
 el('message').textContent=paused?'Race paused. Ready to continue?':'';
 el('start').textContent=paused?'RESUME':'START RACE';
 el('start').onclick=()=>{paused=false;running=true;el('menu').classList.add('hidden');el('start').textContent='START RACE'};
};
addEventListener('resize',()=>{
 if(renderer&&camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
});
frame();
})();
</script>
</body>
</html>`;
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
    
    if (isCarRacingIdea(idea)) {
      const html = make3DRacingGame(appName, theme);
      return res.json({
        ok: true,
        appName,
        summary: "Playable 3D car racing game with traffic, steering, speed, score, pause and restart.",
        html,
        features: [
          "Three.js 3D scene",
          "3D car and four wheels",
          "Road and lane markings",
          "Traffic cars and collision detection",
          "Touch steering and acceleration",
          "Speed, distance and score",
          "Paus
import "dotenv/config";
import express from "express";
import cors from "cors";
import { gzipSync, inflateRawSync } from "node:zlib";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GH_ACTIONS_TOKEN = process.env.GH_ACTIONS_TOKEN || "";

const OWNER = "Shreepals";
const REPO = "ai-app-builder-backend";
const WORKFLOW = "main.yml";
const BACKEND_URL = "https://ai-app-builder-backend-1.onrender.com";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
};

const ENGINE_CATALOG = {
  web: "HTML, CSS and JavaScript web applications",
  phaser: "2D games using Phaser",
  three: "3D browser games using Three.js",
  babylon: "3D browser games using Babylon.js",
  godot: "Native 2D and 3D games using Godot",
  unity: "Advanced games using Unity"
};

const recentBuilds = new Map();

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI App Builder Backend",
    message: "Backend is running"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    githubTokenConfigured: Boolean(GH_ACTIONS_TOKEN),
    model: GEMINI_MODEL,
    engines: Object.keys(ENGINE_CATALOG)
  });
});

function chooseEngine(idea = "") {
  const text = idea.toLowerCase();

  if (/\bgodot\b/.test(text)) return "godot";
  if (/\bunity\b/.test(text)) return "unity";
  if (/babylon/.test(text)) return "babylon";

  if (
    /\b(3d|three\.js|threejs|3d racing|3d car|3d game)\b/.test(text)
  ) {
    return "three";
  }

  if (
    /\b(2d|platformer|arcade|puzzle game|shooting game)\b/.test(text)
  ) {
    return "phaser";
  }

  if (/\b(game|racing|race|shooter|platformer)\b/.test(text)) {
    return "phaser";
  }

  return "web";
}

async function generateWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("Render में GEMINI_API_KEY सेट नहीं है।");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35,
        maxOutputTokens: 24000
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Gemini से ऐप बनाने में समस्या हुई।"
    );
  }

  const output = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");

  if (!output) {
    throw new Error("AI ने कोई ऐप कोड नहीं लौटाया।");
  }

  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("AI का उत्तर वैध JSON नहीं है। दोबारा कोशिश करें।");
  }

  return result;
}

function buildPrompt({ appName, idea, theme }) {
  const engine = chooseEngine(idea);

  return `
You are a professional app and game development AI.

APP NAME: ${appName}
USER IDEA: ${idea}
THEME: ${theme || "Modern"}
SELECTED ENGINE: ${engine}
ENGINE PURPOSE: ${ENGINE_CATALOG[engine]}

Create a complete, usable project matching the user's idea.
Do not replace the requested idea with an unrelated template.

For web apps:
- Return a complete standalone HTML document.
- Include CSS and JavaScript in the HTML.
- Build responsive mobile and desktop layouts.
- Implement the requested screens and functional interactions.
- Use localStorage where useful for saving local data.
- Do not invent real API data or claim external services are connected.

For Phaser games:
- Create a playable 2D game with controls, game loop,
  scoring, collisions where appropriate, pause and restart.
- Use a reliable pinned Phaser CDN version if required.

For Three.js or Babylon.js games:
- Create an actual WebGL 3D scene with camera, lights,
  3D objects, controls, game loop and restart.
- Add visible loading and error messages if the engine fails.
- Do not substitute a static mockup or 2D image for a 3D game.
- Keep mobile performance in mind.

For Godot or Unity requests:
- Explain the required project files and build requirements.
- Do not pretend that a single HTML file is a complete native project.
- If this backend cannot generate the full native project, return
  a useful project plan and state the limitation honestly.

Return valid JSON with these fields:
{
  "appName": "string",
  "summary": "string",
  "engine": "${engine}",
  "features": ["string"],
  "html": "complete HTML document for browser-compatible projects"
}

For browser-compatible projects, html must contain the actual app.
Do not return Markdown fences around JSON.
`;
}

app.post("/api/generate", async (req, res) => {
  try {
    const appName = String(req.body?.appName || "My AI App").slice(0, 100);
    const idea = String(req.body?.idea || "").trim();
    const theme = String(req.body?.theme || "Modern").slice(0, 80);

    if (!idea) {
      return res.status(400).json({ error: "पहले ऐप का आइडिया लिखें।" });
    }

    const engine = chooseEngine(idea);
    const result = await generateWithGemini(
      buildPrompt({ appName, idea, theme })
    );

    const html = String(result.html || "").trim();

    if (
      engine !== "godot" &&
      engine !== "unity" &&
      (!html.toLowerCase().includes("<html") ||
        !html.toLowerCase().includes("</html>"))
    ) {
      return res.status(502).json({
        error: "AI ने पूरा HTML ऐप नहीं बनाया। कृपया दोबारा Generate करें।"
      });
    }

    return res.json({
      appName: result.appName || appName,
      summary: result.summary || "आपके आइडिया से बनाया गया प्रोजेक्ट",
      engine: result.engine || engine,
      features: Array.isArray(result.features) ? result.features : [],
      html,
      message: "Project generated"
    });
  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({
      error: error.message || "ऐप बनाने में समस्या हुई।"
    });
  }
});

app.post("/api/edit-app", async (req, res) => {
  try {
    const appName = String(req.body?.appName || "My AI App");
    const idea = String(req.body?.idea || "").trim();
    const theme = String(req.body?.theme || "Modern");
    const instruction = String(req.body?.instruction || "").trim();
    const existingHtml = String(req.body?.html || "");

    if (!idea || !existingHtml || !instruction) {
      return res.status(400).json({
        error: "आइडिया, मौजूदा HTML और बदलाव का निर्देश जरूरी है।"
      });
    }

    const prompt = `
You are editing an existing app.

App name: ${appName}
Original idea: ${idea}
Theme: ${theme}
User's requested change: ${instruction}

Existing HTML:
${existingHtml}

Rules:
- Return the COMPLETE updated HTML document, not a snippet.
- Preserve existing working features unless the user asks to change them.
- Implement the requested change.
- Keep it responsive and functional.
- Return JSON with appName, summary, engine, features, html.
- Do not wrap the JSON in Markdown fences.
`;

    const result = await generateWithGemini(prompt);
    const html = String(result.html || "").trim();

    if (!html.toLowerCase().includes("<html") ||
        !html.toLowerCase().includes("</html>")) {
      return res.status(502).json({
        error: "AI ने पूरा अपडेटेड HTML नहीं लौटाया।"
      });
    }

    return res.json({
      appName: result.appName || appName,
      summary: result.summary || "App updated",
      engine: result.engine || chooseEngine(idea),
      features: Array.isArray(result.features) ? result.features : [],
      html
    });
  } catch (error) {
    console.error("Edit error:", error);
    return res.status(500).json({
      error: error.message || "ऐप में बदलाव नहीं हो पाया।"
    });
  }
});

app.post("/api/build", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).json({
        error: "Render में GH_ACTIONS_TOKEN सेट नहीं है।"
      });
    }

    const idea = String(req.body?.idea || "").trim();
    const appName = String(req.body?.appName || "My AI App").trim();
    const html = String(req.body?.html || "");

    if (!idea || !html) {
      return res.status(400).json({
        error: "APK बनाने से पहले आइडिया और तैयार HTML जरूरी है।"
      });
    }

    if (
      !html.toLowerCase().includes("<html") ||
      !html.toLowerCase().includes("</html>")
    ) {
      return res.status(400).json({
        error: "दिया गया HTML अधूरा है। पहले ऐप Generate करें।"
      });
    }

    const compressedHtml = gzipSync(Buffer.from(html, "utf8")).toString("base64");

    const dispatchUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}` +
      `/actions/workflows/${WORKFLOW}/dispatches`;

    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: GH_HEADERS,
      body: JSON.stringify({
        ref: "main",
        inputs: {
          idea,
          app_name: appName,
          app_html_gzip_b64: compressedHtml
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("GitHub dispatch error:", detail);

      return res.status(502).json({
        error:
          "GitHub build शुरू नहीं हुआ। main.yml में app_html_gzip_b64 " +
          "input मौजूद है या नहीं जाँचें।"
      });
    }

    const requestedAt = Date.now();
    recentBuilds.set(String(requestedAt), {
      requestedAt,
      appName,
      idea
    });

    return res.json({
      ok: true,
      message: "APK build शुरू हो गया है।",
      requestedAt
    });
  } catch (error) {
    console.error("Build error:", error);
    return res.status(500).json({
      error: error.message || "APK build शुरू नहीं हो पाया।"
    });
  }
});

app.get("/api/build-status", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).json({
        error: "GitHub token configured नहीं है।"
      });
    }

    const requestedAt = Number(req.query.requestedAt || 0);

    const runsUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}` +
      `/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=10`;

    const runsResponse = await fetch(runsUrl, { headers: GH_HEADERS });

    if (!runsResponse.ok) {
      return res.status(502).json({
        error: "GitHub build status नहीं मिल पाया।"
      });
    }

    const runsData = await runsResponse.json();
    const runs = runsData.workflow_runs || [];

    const matchingRun = runs.find((run) => {
      const runTime = Date.parse(run.created_at || "");
      return requestedAt
        ? runTime >= requestedAt - 30000
        : true;
    });

    if (!matchingRun) {
      return res.json({
        status: "waiting",
        message: "Build शुरू होने की प्रतीक्षा है।"
      });
    }

    if (matchingRun.status !== "completed") {
      return res.json({
        status: matchingRun.status || "in_progress",
        message: "APK अभी बन रहा है।"
      });
    }

    if (matchingRun.conclusion !== "success") {
      return res.json({
        status: "failed",
        message: "APK build असफल हुआ। GitHub Actions logs देखें।",
        runUrl: matchingRun.html_url
      });
    }

    const artifactUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}` +
      `/actions/runs/${matchingRun.id}/artifacts`;

    const artifactResponse = await fetch(artifactUrl, {
      headers: GH_HEADERS
    });

    if (!artifactResponse.ok) {
      return res.status(502).json({
        error: "GitHub artifact की जानकारी नहीं मिल पाई।"
      });
    }

    const artifactData = await artifactResponse.json();
    const artifact = (artifactData.artifacts || []).find(
      (item) => item.name === "Myapp-APK" && !item.expired
    );

    if (!artifact) {
      return res.json({
        status: "completed",
        message: "Build सफल हुआ, लेकिन Myapp-APK artifact नहीं मिला।",
        runUrl: matchingRun.html_url
      });
    }

    return res.json({
      status: "success",
      message: "APK तैयार है।",
      downloadUrl:
        `${BACKEND_URL}/api/apk-download?run_id=${matchingRun.id}`,
      runUrl: matchingRun.html_url
    });
  } catch (error) {
    console.error("Status error:", error);
    return res.status(500).json({
      error: error.message || "Build status जाँचने में समस्या हुई।"
    });
  }
});

app.get("/api/apk-download", async (req, res) => {
  try {
    if (!GH_ACTIONS_TOKEN) {
      return res.status(500).send("GitHub token configured नहीं है।");
    }

    const runId = String(req.query.run_id || "");

    if (!/^\d+$/.test(runId)) {
      return res.status(400).send("Invalid run_id.");
    }

    const artifactUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}` +
      `/actions/runs/${runId}/artifacts`;

    const artifactResponse = await fetch(artifactUrl, {
      headers: GH_HEADERS
    });

    if (!artifactResponse.ok) {
      return res.status(502).send("Artifact list नहीं मिल पाई।");
    }

    const artifactData = await artifactResponse.json();
    const artifact = (artifactData.artifacts || []).find(
      (item) => item.name === "Myapp-APK" && !item.expired
    );

    if (!artifact) {
      return res.status(404).send("APK artifact नहीं मिला।");
    }

    const zipResponse = await fetch(artifact.archive_download_url, {
      headers: {
        Authorization: `Bearer ${GH_ACTIONS_TOKEN}`,
        Accept: "application/vnd.github+json"
      },
      redirect: "follow"
    });

    if (!zipResponse.ok) {
      return res.status(502).send("APK artifact डाउनलोड नहीं हो पाया।");
    }

    const zip = Buffer.from(await zipResponse.arrayBuffer());
    const apk = extractApkFromZip(zip);

    if (!apk) {
      return res.status(404).send("ZIP में APK फ़ाइल नहीं मिली।");
    }

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="AI-App.apk"');
    res.setHeader("Content-Length", String(apk.length));
    return res.send(apk);
  } catch (error) {
    console.error("APK download error:", error);
    return res.status(500).send("APK डाउनलोड करने में समस्या हुई।");
  }
});

function extractApkFromZip(zip) {
  let offset = 0;

  while (offset + 30 < zip.length) {
    const signature = zip.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const flags = zip.readUInt16LE(offset + 6);
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);

    if (flags & 0x08) {
      // ZIP data descriptors require central-directory parsing.
      // Avoid guessing sizes when the descriptor flag is set.
      return null;
    }

    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const fileName = zip.toString(
      "utf8",
      nameStart,
      nameStart + fileNameLength
    );

    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zip.length) return null;

    if (fileName.toLowerCase().endsWith(".apk")) {
      const compressed = zip.subarray(dataStart, dataEnd);

      if (method === 0) return Buffer.from(compressed);
      if (method === 8) return inflateRawSync(compressed);

      return null;
    }

    offset = dataEnd;
  }

  return null;
}

app.listen(PORT, () => {
  console.log(`AI App Builder backend running on port ${PORT}`);
});
