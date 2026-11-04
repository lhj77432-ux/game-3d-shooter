import * as THREE from 'three';

const STORAGE_KEY = 'game3d_shooter_progress_v1';
const IS_TOUCH = matchMedia('(pointer: coarse)').matches ||
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const MAG_SIZE = 30;
const MAX_RESERVE = 120;
const FIRE_COOLDOWN = 0.14;
const RELOAD_TIME = 1.2;
const PLAYER_SPEED = 7;
const PLAYER_RADIUS = 0.45;
const BULLET_SPEED = 48;
const BULLET_LIFE = 1.4;
const PLAYER_MAX_HP = 100;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('c');
const el = {
  start: document.getElementById('overlay-start'),
  pause: document.getElementById('overlay-pause'),
  clear: document.getElementById('overlay-clear'),
  fail: document.getElementById('overlay-fail'),
  hud: document.getElementById('hud'),
  levelSelect: document.getElementById('level-select'),
  hudLevel: document.getElementById('hud-level'),
  hudObjective: document.getElementById('hud-objective'),
  hudTimerWrap: document.getElementById('hud-timer-wrap'),
  hudTimer: document.getElementById('hud-timer'),
  hudHp: document.getElementById('hud-hp'),
  barHp: document.getElementById('bar-hp'),
  hudAmmo: document.getElementById('hud-ammo'),
  clearTitle: document.getElementById('clear-title'),
  clearMsg: document.getElementById('clear-msg'),
  failMsg: document.getElementById('fail-msg'),
  mobile: document.getElementById('mobile-controls'),
  joystick: document.getElementById('joystick'),
  joyKnob: document.getElementById('joy-knob'),
  lookZone: document.getElementById('look-zone'),
  btnFire: document.getElementById('btn-fire'),
  btnReload: document.getElementById('btn-reload'),
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { unlocked: 1, cleared: [] };
    const data = JSON.parse(raw);
    return {
      unlocked: Math.max(1, Math.min(10, data.unlocked || 1)),
      cleared: Array.isArray(data.cleared) ? data.cleared : [],
    };
  } catch {
    return { unlocked: 1, cleared: [] };
  }
}
function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
let progress = loadProgress();

const LEVELS = [
  {
    id: 1, name: '教学：静止靶',
    objective: '击毁全部静止靶',
    size: [28, 28],
    player: [0, 0.9, 10],
    walls: [
      [-14, 0, -14, 28, 3, 1], [ -14, 0, 13, 28, 3, 1],
      [-14, 0, -14, 1, 3, 28], [13, 0, -14, 1, 3, 28],
    ],
    covers: [],
    enemies: [
      { type: 'static', pos: [0, 1, -6], hp: 1 },
      { type: 'static', pos: [-5, 1, -8], hp: 1 },
      { type: 'static', pos: [5, 1, -8], hp: 1 },
      { type: 'static', pos: [-3, 1, -11], hp: 1 },
      { type: 'static', pos: [3, 1, -11], hp: 1 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 2, name: '移动靶',
    objective: '击毁 3 个移动靶',
    size: [30, 30],
    player: [0, 0.9, 12],
    walls: [
      [-15, 0, -15, 30, 3, 1], [-15, 0, 14, 30, 3, 1],
      [-15, 0, -15, 1, 3, 30], [14, 0, -15, 1, 3, 30],
    ],
    covers: [[-4, 0, 2, 2, 1.6, 2], [4, 0, 2, 2, 1.6, 2]],
    enemies: [
      { type: 'strafe', pos: [-8, 1, -6], hp: 2, amp: 6, speed: 2.2 },
      { type: 'strafe', pos: [0, 1, -9], hp: 2, amp: 5, speed: 2.8 },
      { type: 'strafe', pos: [8, 1, -6], hp: 2, amp: 6, speed: 2.2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 3, name: '掩体与侧移',
    objective: '清理侧移敌人',
    size: [32, 32],
    player: [0, 0.9, 13],
    walls: [
      [-16, 0, -16, 32, 3.2, 1], [-16, 0, 15, 32, 3.2, 1],
      [-16, 0, -16, 1, 3.2, 32], [15, 0, -16, 1, 3.2, 32],
    ],
    covers: [
      [-6, 0, 4, 2.4, 1.8, 1.2], [6, 0, 4, 2.4, 1.8, 1.2],
      [0, 0, -2, 3, 1.8, 1.2], [-8, 0, -6, 2, 1.8, 2], [8, 0, -6, 2, 1.8, 2],
    ],
    enemies: [
      { type: 'strafe', pos: [-10, 1, -4], hp: 3, amp: 4, speed: 2.5, shoot: true },
      { type: 'strafe', pos: [10, 1, -4], hp: 3, amp: 4, speed: 2.5, shoot: true },
      { type: 'strafe', pos: [0, 1, -10], hp: 3, amp: 7, speed: 3.2, shoot: true },
      { type: 'static', pos: [-4, 1, -12], hp: 2 },
      { type: 'static', pos: [4, 1, -12], hp: 2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 4, name: '双波限弹',
    objective: '两波敌人 · 弹药有限',
    size: [30, 30],
    player: [0, 0.9, 12],
    walls: [
      [-15, 0, -15, 30, 3, 1], [-15, 0, 14, 30, 3, 1],
      [-15, 0, -15, 1, 3, 30], [14, 0, -15, 1, 3, 30],
    ],
    covers: [[-5, 0, 3, 2.5, 1.7, 1.5], [5, 0, 3, 2.5, 1.7, 1.5], [0, 0, -4, 3, 1.7, 1.2]],
    enemies: [],
    waves: [
      [
        { type: 'strafe', pos: [-7, 1, -5], hp: 2, amp: 4, speed: 2.4, shoot: true },
        { type: 'strafe', pos: [7, 1, -5], hp: 2, amp: 4, speed: 2.4, shoot: true },
        { type: 'static', pos: [0, 1, -9], hp: 2 },
      ],
      [
        { type: 'strafe', pos: [-9, 1, -3], hp: 3, amp: 5, speed: 2.8, shoot: true },
        { type: 'strafe', pos: [9, 1, -3], hp: 3, amp: 5, speed: 2.8, shoot: true },
        { type: 'charge', pos: [0, 1, -12], hp: 3, speed: 5.5 },
        { type: 'static', pos: [-3, 1, -11], hp: 2 },
      ],
    ],
    ammoCap: { mag: 20, reserve: 40 },
    timeLimit: null,
  },
  {
    id: 5, name: '简易 Boss',
    objective: '击败多血量 Boss',
    size: [34, 34],
    player: [0, 0.9, 14],
    walls: [
      [-17, 0, -17, 34, 3.5, 1], [-17, 0, 16, 34, 3.5, 1],
      [-17, 0, -17, 1, 3.5, 34], [16, 0, -17, 1, 3.5, 34],
    ],
    covers: [[-7, 0, 5, 2.5, 1.8, 2], [7, 0, 5, 2.5, 1.8, 2], [0, 0, 0, 3, 1.5, 1.5]],
    enemies: [
      { type: 'boss', pos: [0, 1.4, -10], hp: 28, amp: 8, speed: 2.0, shoot: true },
      { type: 'static', pos: [-10, 1, -8], hp: 2 },
      { type: 'static', pos: [10, 1, -8], hp: 2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 6, name: '窄廊冲锋',
    objective: '挡住近战冲锋',
    size: [16, 40],
    player: [0, 0.9, 16],
    walls: [
      [-8, 0, -20, 16, 3.2, 1], [-8, 0, 19, 16, 3.2, 1],
      [-8, 0, -20, 1, 3.2, 40], [7, 0, -20, 1, 3.2, 40],
      [-4, 0, -2, 2, 2.5, 1.5], [2, 0, 4, 2, 2.5, 1.5],
    ],
    covers: [[-3, 0, 8, 1.5, 1.5, 1.2], [3, 0, 2, 1.5, 1.5, 1.2]],
    enemies: [
      { type: 'charge', pos: [0, 1, -14], hp: 3, speed: 6.5 },
      { type: 'charge', pos: [-2, 1, -10], hp: 3, speed: 6.0 },
      { type: 'charge', pos: [2, 1, -10], hp: 3, speed: 6.0 },
      { type: 'charge', pos: [0, 1, -6], hp: 4, speed: 7.0 },
      { type: 'charge', pos: [-1.5, 1, -16], hp: 3, speed: 5.5 },
      { type: 'charge', pos: [1.5, 1, -16], hp: 3, speed: 5.5 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 7, name: '高台',
    objective: '从高台清理下方敌人',
    size: [36, 36],
    player: [0, 5.5, 10],
    walls: [
      [-18, 0, -18, 36, 3, 1], [-18, 0, 17, 36, 3, 1],
      [-18, 0, -18, 1, 3, 36], [17, 0, -18, 1, 3, 36],
    ],
    covers: [],
    platforms: [
      { pos: [0, 0, 8], size: [10, 4.5, 8] },
      { pos: [0, 0, 14], size: [4, 4.5, 4] },
    ],
    enemies: [
      { type: 'strafe', pos: [-10, 1, -4], hp: 3, amp: 5, speed: 2.5, shoot: true },
      { type: 'strafe', pos: [10, 1, -4], hp: 3, amp: 5, speed: 2.5, shoot: true },
      { type: 'strafe', pos: [0, 1, -12], hp: 3, amp: 6, speed: 3, shoot: true },
      { type: 'charge', pos: [-6, 1, 0], hp: 3, speed: 5 },
      { type: 'charge', pos: [6, 1, 0], hp: 3, speed: 5 },
      { type: 'static', pos: [-12, 1, -10], hp: 2 },
      { type: 'static', pos: [12, 1, -10], hp: 2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 8, name: '限时 60 秒',
    objective: '60 秒内清空全场',
    size: [30, 30],
    player: [0, 0.9, 12],
    walls: [
      [-15, 0, -15, 30, 3, 1], [-15, 0, 14, 30, 3, 1],
      [-15, 0, -15, 1, 3, 30], [14, 0, -15, 1, 3, 30],
    ],
    covers: [[-5, 0, 2, 2, 1.6, 2], [5, 0, 2, 2, 1.6, 2], [0, 0, -5, 2.5, 1.6, 1.5]],
    enemies: [
      { type: 'strafe', pos: [-8, 1, -4], hp: 2, amp: 4, speed: 3, shoot: true },
      { type: 'strafe', pos: [8, 1, -4], hp: 2, amp: 4, speed: 3, shoot: true },
      { type: 'strafe', pos: [0, 1, -9], hp: 2, amp: 5, speed: 3.5, shoot: true },
      { type: 'charge', pos: [-4, 1, -12], hp: 2, speed: 6.5 },
      { type: 'charge', pos: [4, 1, -12], hp: 2, speed: 6.5 },
      { type: 'static', pos: [-10, 1, -10], hp: 1 },
      { type: 'static', pos: [10, 1, -10], hp: 1 },
      { type: 'static', pos: [0, 1, -13], hp: 1 },
    ],
    ammoCap: null, timeLimit: 60, waves: null,
  },
  {
    id: 9, name: '远程＋近战',
    objective: '混合敌人全灭',
    size: [32, 32],
    player: [0, 0.9, 13],
    walls: [
      [-16, 0, -16, 32, 3.2, 1], [-16, 0, 15, 32, 3.2, 1],
      [-16, 0, -16, 1, 3.2, 32], [15, 0, -16, 1, 3.2, 32],
    ],
    covers: [
      [-6, 0, 5, 2.2, 1.8, 1.5], [6, 0, 5, 2.2, 1.8, 1.5],
      [0, 0, -1, 3, 1.8, 1.2], [-9, 0, -6, 2, 1.8, 2], [9, 0, -6, 2, 1.8, 2],
    ],
    enemies: [
      { type: 'strafe', pos: [-11, 1, -5], hp: 3, amp: 4, speed: 2.6, shoot: true },
      { type: 'strafe', pos: [11, 1, -5], hp: 3, amp: 4, speed: 2.6, shoot: true },
      { type: 'strafe', pos: [0, 1, -12], hp: 4, amp: 6, speed: 2.8, shoot: true },
      { type: 'charge', pos: [-3, 1, -8], hp: 3, speed: 6.2 },
      { type: 'charge', pos: [3, 1, -8], hp: 3, speed: 6.2 },
      { type: 'charge', pos: [0, 1, -4], hp: 4, speed: 6.8 },
      { type: 'static', pos: [-7, 1, -13], hp: 2 },
      { type: 'static', pos: [7, 1, -13], hp: 2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
  {
    id: 10, name: '终关 Boss',
    objective: '击败终局 Boss 与小怪',
    size: [36, 36],
    player: [0, 0.9, 15],
    walls: [
      [-18, 0, -18, 36, 3.5, 1], [-18, 0, 17, 36, 3.5, 1],
      [-18, 0, -18, 1, 3.5, 36], [17, 0, -18, 1, 3.5, 36],
    ],
    covers: [
      [-8, 0, 6, 2.5, 1.9, 2], [8, 0, 6, 2.5, 1.9, 2],
      [-4, 0, -2, 2, 1.7, 2], [4, 0, -2, 2, 1.7, 2], [0, 0, 4, 3, 1.5, 1.5],
    ],
    enemies: [
      { type: 'boss', pos: [0, 1.5, -10], hp: 40, amp: 9, speed: 2.2, shoot: true },
      { type: 'strafe', pos: [-12, 1, -4], hp: 3, amp: 4, speed: 2.8, shoot: true },
      { type: 'strafe', pos: [12, 1, -4], hp: 3, amp: 4, speed: 2.8, shoot: true },
      { type: 'charge', pos: [-5, 1, -14], hp: 3, speed: 6.5 },
      { type: 'charge', pos: [5, 1, -14], hp: 3, speed: 6.5 },
      { type: 'charge', pos: [0, 1, -6], hp: 4, speed: 7 },
      { type: 'static', pos: [-10, 1, -12], hp: 2 },
      { type: 'static', pos: [10, 1, -12], hp: 2 },
    ],
    ammoCap: null, timeLimit: null, waves: null,
  },
];

// ——— renderer / scene ———
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 18, 55);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 120);
const yawObject = new THREE.Object3D();
const pitchObject = new THREE.Object3D();
pitchObject.add(camera);
yawObject.add(pitchObject);
scene.add(yawObject);

const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x223344, 0.85);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(8, 18, 6);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
scene.add(dir);

const keys = { w: false, a: false, s: false, d: false };
const mouse = { dx: 0, dy: 0 };
const joy = { x: 0, y: 0 };
let firing = false;
let pointerLocked = false;

let state = 'menu'; // menu | playing | paused | clear | fail
let levelIndex = 0;
let levelDef = null;
let player = {
  hp: PLAYER_MAX_HP,
  mag: MAG_SIZE,
  reserve: MAX_RESERVE,
  reloadT: 0,
  fireCd: 0,
  invuln: 0,
};
let enemies = [];
let bullets = [];
let enemyBullets = [];
let colliders = []; // AABB {minx,maxx,miny,maxy,minz,maxz}
let worldRoot = null;
let clock = new THREE.Clock();
let timeLeft = 0;
let waveIndex = 0;
let wavePending = false;
let waveTimer = 0;
let muzzleFlash = null;

function aabbFromBox(x, y, z, w, h, d) {
  return { minx: x, maxx: x + w, miny: y, maxy: y + h, minz: z, maxz: z + d };
}
function pointInAabb(px, pz, box, radius = 0) {
  return px + radius > box.minx && px - radius < box.maxx &&
    pz + radius > box.minz && pz - radius < box.maxz;
}
function resolveMove(pos, dx, dz, radius) {
  let nx = pos.x + dx;
  let nz = pos.z + dz;
  for (const box of colliders) {
    if (pos.y + 0.2 > box.maxy || pos.y + 1.6 < box.miny) continue;
    // X then Z
  }
  // separate axes
  for (const box of colliders) {
    if (pos.y + 0.15 >= box.maxy || pos.y + 1.5 <= box.miny) continue;
    if (nx + radius > box.minx && nx - radius < box.maxx &&
        pos.z + radius > box.minz && pos.z - radius < box.maxz) {
      if (dx > 0) nx = box.minx - radius;
      else if (dx < 0) nx = box.maxx + radius;
    }
  }
  for (const box of colliders) {
    if (pos.y + 0.15 >= box.maxy || pos.y + 1.5 <= box.miny) continue;
    if (nx + radius > box.minx && nx - radius < box.maxx &&
        nz + radius > box.minz && nz - radius < box.maxz) {
      if (dz > 0) nz = box.minz - radius;
      else if (dz < 0) nz = box.maxz + radius;
    }
  }
  pos.x = nx;
  pos.z = nz;
}

function getGroundY(x, z) {
  let best = 0;
  if (!levelDef) return 0;
  const plats = levelDef.platforms || [];
  for (const p of plats) {
    const [sx, sy, sz] = p.size;
    const [px, py, pz] = p.pos;
    const minx = px - sx / 2, maxx = px + sx / 2;
    const minz = pz - sz / 2, maxz = pz + sz / 2;
    if (x >= minx && x <= maxx && z >= minz && z <= maxz) {
      best = Math.max(best, py + sy);
    }
  }
  return best;
}

function makeMat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color, emissive, roughness: 0.75, metalness: 0.1,
  });
}

function clearWorld() {
  if (worldRoot) {
    scene.remove(worldRoot);
    worldRoot.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
  worldRoot = new THREE.Group();
  scene.add(worldRoot);
  enemies = [];
  bullets = [];
  enemyBullets = [];
  colliders = [];
}

function addBoxMesh(x, y, z, w, h, d, color, collidable = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, makeMat(color));
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  worldRoot.add(mesh);
  if (collidable) colliders.push(aabbFromBox(x, y, z, w, h, d));
  return mesh;
}

function spawnEnemy(def) {
  const group = new THREE.Group();
  const isBoss = def.type === 'boss';
  const isCharge = def.type === 'charge';
  const bodyColor = isBoss ? 0xc0392b : isCharge ? 0xe67e22 : 0x3498db;
  const scale = isBoss ? 1.8 : isCharge ? 1.05 : 1;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7 * scale, 1.2 * scale, 0.55 * scale),
    makeMat(bodyColor, isBoss ? 0x330000 : 0x000000)
  );
  body.position.y = 0.7 * scale;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * scale, 12, 12),
    makeMat(0xf5d0a9)
  );
  head.position.y = 1.45 * scale;
  group.add(head);
  if (def.shoot || isBoss) {
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.55 * scale),
      makeMat(0x222222)
    );
    gun.position.set(0.35 * scale, 0.85 * scale, -0.35 * scale);
    group.add(gun);
  }
  group.position.set(def.pos[0], def.pos[1] - 1 + (isBoss ? 0.2 : 0), def.pos[2]);
  // place on ground relative to feet
  const gy = getGroundY(def.pos[0], def.pos[2]);
  group.position.y = gy;

  worldRoot.add(group);
  const enemy = {
    mesh: group,
    type: def.type,
    hp: def.hp,
    maxHp: def.hp,
    base: new THREE.Vector3(def.pos[0], gy, def.pos[2]),
    amp: def.amp || 0,
    speed: def.speed || 2,
    shoot: !!def.shoot || isBoss,
    phase: Math.random() * Math.PI * 2,
    shootCd: 1 + Math.random(),
    hitFlash: 0,
    alive: true,
    radius: 0.4 * scale,
    height: 1.6 * scale,
  };
  enemies.push(enemy);
  return enemy;
}

function buildLevel(idx) {
  clearWorld();
  levelIndex = idx;
  levelDef = LEVELS[idx];
  const [sw, sd] = levelDef.size;

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(sw + 4, sd + 4),
    makeMat(0x1a2436)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  worldRoot.add(floor);

  // grid helper faint
  const grid = new THREE.GridHelper(Math.max(sw, sd), Math.max(sw, sd) / 2, 0x2a3b55, 0x152033);
  grid.position.y = 0.01;
  worldRoot.add(grid);

  for (const w of levelDef.walls) {
    addBoxMesh(w[0], w[1], w[2], w[3], w[4], w[5], 0x2c3e50);
  }
  for (const c of levelDef.covers || []) {
    addBoxMesh(c[0], c[1], c[2], c[3], c[4], c[5], 0x566573);
  }
  for (const p of levelDef.platforms || []) {
    const [sx, sy, sz] = p.size;
    const [px, py, pz] = p.pos;
    addBoxMesh(px - sx / 2, py, pz - sz / 2, sx, sy, sz, 0x3d566e);
  }

  // spawn player
  const [px, py, pz] = levelDef.player;
  yawObject.position.set(px, py, pz);
  yawObject.rotation.set(0, 0, 0);
  pitchObject.rotation.set(0, 0, 0);

  player.hp = PLAYER_MAX_HP;
  if (levelDef.ammoCap) {
    player.mag = levelDef.ammoCap.mag;
    player.reserve = levelDef.ammoCap.reserve;
  } else {
    player.mag = MAG_SIZE;
    player.reserve = MAX_RESERVE;
  }
  player.reloadT = 0;
  player.fireCd = 0;
  player.invuln = 0;

  waveIndex = 0;
  wavePending = false;
  waveTimer = 0;
  timeLeft = levelDef.timeLimit || 0;

  if (levelDef.waves) {
    for (const e of levelDef.waves[0]) spawnEnemy(e);
  } else {
    for (const e of levelDef.enemies) spawnEnemy(e);
  }

  // muzzle flash light
  if (muzzleFlash) scene.remove(muzzleFlash);
  muzzleFlash = new THREE.PointLight(0xffaa55, 0, 6);
  camera.add(muzzleFlash);
  muzzleFlash.position.set(0.2, -0.1, -0.5);

  updateHUD();
}

function remainingEnemies() {
  return enemies.filter((e) => e.alive).length;
}

function updateHUD() {
  el.hudLevel.textContent = `${levelDef.id} · ${levelDef.name}`;
  let obj = levelDef.objective;
  if (levelDef.waves) obj += `（波次 ${waveIndex + 1}/${levelDef.waves.length}）`;
  obj += ` · 剩余 ${remainingEnemies()}`;
  el.hudObjective.textContent = obj;
  el.hudHp.textContent = String(Math.max(0, Math.ceil(player.hp)));
  el.barHp.style.width = `${Math.max(0, (player.hp / PLAYER_MAX_HP) * 100)}%`;
  const reloading = player.reloadT > 0 ? ' 换弹中…' : '';
  el.hudAmmo.textContent = `${player.mag} / ${player.reserve}${reloading}`;
  if (levelDef.timeLimit) {
    el.hudTimerWrap.classList.remove('hidden');
    el.hudTimer.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  } else {
    el.hudTimerWrap.classList.add('hidden');
  }
}

function renderLevelSelect() {
  el.levelSelect.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'lvl-btn';
    btn.textContent = String(i + 1);
    btn.disabled = i + 1 > progress.unlocked;
    if (progress.cleared.includes(i + 1)) btn.classList.add('cleared');
    if (i + 1 === progress.unlocked) btn.classList.add('current');
    btn.title = LEVELS[i].name;
    btn.addEventListener('click', () => startLevel(i));
    el.levelSelect.appendChild(btn);
  }
}

function showOverlay(name) {
  el.start.classList.toggle('hidden', name !== 'menu');
  el.pause.classList.toggle('hidden', name !== 'paused');
  el.clear.classList.toggle('hidden', name !== 'clear');
  el.fail.classList.toggle('hidden', name !== 'fail');
  el.hud.classList.toggle('hidden', name !== 'playing' && name !== 'paused');
  const showMobile = IS_TOUCH && name === 'playing';
  el.mobile.classList.toggle('hidden', !showMobile);
}

function startLevel(idx) {
  if (idx + 1 > progress.unlocked) return;
  buildLevel(idx);
  state = 'playing';
  showOverlay('playing');
  clock.start();
  if (!IS_TOUCH) {
    canvas.requestPointerLock?.();
  }
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  showOverlay('paused');
  document.exitPointerLock?.();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  showOverlay('playing');
  clock.getDelta();
  if (!IS_TOUCH) canvas.requestPointerLock?.();
}

function goMenu() {
  state = 'menu';
  document.exitPointerLock?.();
  clearWorld();
  showOverlay('menu');
  renderLevelSelect();
}

function onLevelClear() {
  state = 'clear';
  document.exitPointerLock?.();
  const id = levelDef.id;
  if (!progress.cleared.includes(id)) progress.cleared.push(id);
  progress.unlocked = Math.max(progress.unlocked, Math.min(10, id + 1));
  saveProgress(progress);
  el.clearTitle.textContent = id === 10 ? '全部通关！' : '关卡通过！';
  el.clearMsg.textContent = id === 10
    ? '恭喜打通全部 10 关。'
    : `已解锁第 ${id + 1} 关。`;
  showOverlay('clear');
  renderLevelSelect();
}

function onFail(reason) {
  state = 'fail';
  document.exitPointerLock?.();
  el.failMsg.textContent = reason;
  showOverlay('fail');
}

function tryReload() {
  if (player.reloadT > 0) return;
  if (player.mag >= (levelDef.ammoCap?.mag || MAG_SIZE)) return;
  if (player.reserve <= 0) return;
  player.reloadT = RELOAD_TIME;
}

function shoot() {
  if (state !== 'playing') return;
  if (player.reloadT > 0 || player.fireCd > 0) return;
  if (player.mag <= 0) {
    tryReload();
    return;
  }
  player.mag -= 1;
  player.fireCd = FIRE_COOLDOWN;
  muzzleFlash.intensity = 2.5;

  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // slight spread
  dir.x += (Math.random() - 0.5) * 0.02;
  dir.y += (Math.random() - 0.5) * 0.02;
  dir.z += (Math.random() - 0.5) * 0.02;
  dir.normalize();

  const geo = new THREE.SphereGeometry(0.06, 6, 6);
  const mesh = new THREE.Mesh(geo, makeMat(0xffe066, 0xaa8800));
  mesh.position.copy(origin).addScaledVector(dir, 0.6);
  worldRoot.add(mesh);
  bullets.push({
    mesh,
    vel: dir.multiplyScalar(BULLET_SPEED),
    life: BULLET_LIFE,
    fromPlayer: true,
  });
  updateHUD();
}

function damagePlayer(amount) {
  if (player.invuln > 0) return;
  player.hp -= amount;
  player.invuln = 0.55;
  updateHUD();
  if (player.hp <= 0) onFail('生命耗尽');
}

function damageEnemy(enemy, amount) {
  if (!enemy.alive) return;
  enemy.hp -= amount;
  enemy.hitFlash = 0.15;
  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.mesh.visible = false;
  }
}

function rayHitsEnemy(origin, dir, maxDist = 2) {
  // for melee proximity unused; bullets use sphere test
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    let hit = false;
    // walls
    for (const box of colliders) {
      const p = b.mesh.position;
      if (p.x > box.minx && p.x < box.maxx &&
          p.y > box.miny && p.y < box.maxy &&
          p.z > box.minz && p.z < box.maxz) {
        hit = true; break;
      }
    }
    if (!hit) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const ep = e.mesh.position;
        const dx = b.mesh.position.x - ep.x;
        const dy = b.mesh.position.y - (ep.y + e.height * 0.5);
        const dz = b.mesh.position.z - ep.z;
        const r = e.radius + 0.15;
        if (dx * dx + dy * dy * 0.5 + dz * dz < r * r) {
          damageEnemy(e, e.type === 'boss' ? 1 : 1);
          hit = true;
          break;
        }
      }
    }
    if (hit || b.life <= 0 || b.mesh.position.y < -1) {
      worldRoot.remove(b.mesh);
      b.mesh.geometry.dispose();
      bullets.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    let hit = false;
    for (const box of colliders) {
      const p = b.mesh.position;
      if (p.x > box.minx && p.x < box.maxx &&
          p.y > box.miny && p.y < box.maxy &&
          p.z > box.minz && p.z < box.maxz) {
        hit = true; break;
      }
    }
    const pp = yawObject.position;
    const dx = b.mesh.position.x - pp.x;
    const dy = b.mesh.position.y - (pp.y);
    const dz = b.mesh.position.z - pp.z;
    if (dx * dx + dy * dy + dz * dz < 0.55 * 0.55) {
      damagePlayer(b.damage || 8);
      hit = true;
    }
    if (hit || b.life <= 0) {
      worldRoot.remove(b.mesh);
      b.mesh.geometry.dispose();
      enemyBullets.splice(i, 1);
    }
  }
}

function enemyShoot(e, dt) {
  if (!e.shoot || !e.alive) return;
  e.shootCd -= dt;
  if (e.shootCd > 0) return;
  const toPlayer = new THREE.Vector3().subVectors(yawObject.position, e.mesh.position);
  const dist = toPlayer.length();
  if (dist > 28 || dist < 1.5) return;
  // line of sight rough: skip if cover between (simple distance check only)
  e.shootCd = e.type === 'boss' ? 0.55 : 1.1 + Math.random() * 0.5;
  toPlayer.y += 0.2;
  toPlayer.normalize();
  const origin = e.mesh.position.clone();
  origin.y += e.height * 0.7;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    makeMat(0xff5555, 0x880000)
  );
  mesh.position.copy(origin).addScaledVector(toPlayer, 0.8);
  worldRoot.add(mesh);
  const speed = e.type === 'boss' ? 22 : 16;
  enemyBullets.push({
    mesh,
    vel: toPlayer.multiplyScalar(speed),
    life: 2.5,
    damage: e.type === 'boss' ? 12 : 8,
  });
}

function updateEnemies(dt) {
  const t = performance.now() / 1000;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) {
      e.hitFlash -= dt;
      e.mesh.children[0].material.emissive?.setHex(e.hitFlash > 0 ? 0xffffff : 0x000000);
    }
    if (e.type === 'strafe' || e.type === 'boss') {
      const ox = e.base.x + Math.sin(t * e.speed + e.phase) * e.amp;
      const oz = e.base.z + Math.cos(t * e.speed * 0.6 + e.phase) * (e.amp * 0.35);
      e.mesh.position.x = ox;
      e.mesh.position.z = oz;
      e.mesh.position.y = getGroundY(ox, oz);
      // face player
      e.mesh.lookAt(yawObject.position.x, e.mesh.position.y, yawObject.position.z);
      enemyShoot(e, dt);
    } else if (e.type === 'charge') {
      const to = new THREE.Vector3().subVectors(yawObject.position, e.mesh.position);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.4) {
        to.normalize();
        const step = e.speed * dt;
        const nx = e.mesh.position.x + to.x * step;
        const nz = e.mesh.position.z + to.z * step;
        // simple wall avoid
        let blocked = false;
        for (const box of colliders) {
          if (nx + e.radius > box.minx && nx - e.radius < box.maxx &&
              nz + e.radius > box.minz && nz - e.radius < box.maxz &&
              e.mesh.position.y + 0.5 < box.maxy) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          e.mesh.position.x = nx;
          e.mesh.position.z = nz;
        }
        e.mesh.position.y = getGroundY(e.mesh.position.x, e.mesh.position.z);
        e.mesh.lookAt(yawObject.position.x, e.mesh.position.y, yawObject.position.z);
      }
      if (dist < 1.1) damagePlayer(18 * dt); // continuous melee
    } else if (e.type === 'static') {
      e.mesh.lookAt(yawObject.position.x, e.mesh.position.y, yawObject.position.z);
    }
  }
}

function updatePlayer(dt) {
  // look
  const sens = IS_TOUCH ? 0.0032 : 0.0022;
  yawObject.rotation.y -= mouse.dx * sens;
  pitchObject.rotation.x -= mouse.dy * sens;
  pitchObject.rotation.x = Math.max(-1.4, Math.min(1.4, pitchObject.rotation.x));
  mouse.dx = 0;
  mouse.dy = 0;

  // move
  let mx = 0, mz = 0;
  if (keys.w) mz -= 1;
  if (keys.s) mz += 1;
  if (keys.a) mx -= 1;
  if (keys.d) mx += 1;
  if (IS_TOUCH) {
    mx += joy.x;
    mz += joy.y;
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  // note: W should move forward (camera look), S back
  // our mz: -1 is W → want +forward
  const wish = new THREE.Vector3()
    .addScaledVector(forward, -mz)
    .addScaledVector(right, mx);

  const pos = yawObject.position;
  const ground = getGroundY(pos.x, pos.z);
  pos.y = ground + 0.9;

  if (wish.lengthSq() > 0) {
    wish.normalize().multiplyScalar(PLAYER_SPEED * dt);
    resolveMove(pos, wish.x, wish.z, PLAYER_RADIUS);
    pos.y = getGroundY(pos.x, pos.z) + 0.9;
  }

  if (player.invuln > 0) player.invuln -= dt;
  if (player.fireCd > 0) player.fireCd -= dt;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      const cap = levelDef.ammoCap?.mag || MAG_SIZE;
      const need = cap - player.mag;
      const take = Math.min(need, player.reserve);
      player.mag += take;
      player.reserve -= take;
      updateHUD();
    }
  }
  if (muzzleFlash.intensity > 0) {
    muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 12);
  }
  if (firing) shoot();
}

function checkWinLose(dt) {
  if (state !== 'playing') return;
  if (levelDef.timeLimit) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHUD();
      onFail('时间到');
      return;
    }
  }
  if (wavePending) {
    waveTimer -= dt;
    if (waveTimer <= 0) {
      wavePending = false;
      waveIndex += 1;
      for (const e of levelDef.waves[waveIndex]) spawnEnemy(e);
      updateHUD();
    }
    return;
  }
  if (remainingEnemies() === 0) {
    if (levelDef.waves && waveIndex < levelDef.waves.length - 1) {
      wavePending = true;
      waveTimer = 1.2;
      el.hudObjective.textContent = `下一波即将到来…`;
      return;
    }
    onLevelClear();
  } else {
    updateHUD();
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (state === 'playing') {
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    checkWinLose(dt);
  }
  renderer.render(scene, camera);
}

// ——— input ———
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') keys[k] = true;
  if (k === 'r') tryReload();
  if (k === 'escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') keys[k] = false;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || state !== 'playing') return;
  mouse.dx += e.movementX;
  mouse.dy += e.movementY;
});
document.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (e.button === 0) {
    if (!IS_TOUCH && !pointerLocked) canvas.requestPointerLock?.();
    firing = true;
    shoot();
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});

// mobile joystick
function bindJoystick() {
  const base = el.joystick;
  const knob = el.joyKnob;
  let pid = null;
  const maxR = 40;
  function setKnob(x, y) {
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }
  function onStart(e) {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    pid = t.identifier ?? 'mouse';
    onMove(e);
  }
  function onMove(e) {
    if (pid === null) return;
    const t = e.changedTouches
      ? [...e.changedTouches].find((c) => c.identifier === pid) || e.touches[0]
      : e;
    if (!t) return;
    const rect = base.getBoundingClientRect();
    let dx = t.clientX - (rect.left + rect.width / 2);
    let dy = t.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
    joy.x = dx / maxR;
    joy.y = dy / maxR;
    setKnob(dx, dy);
    e.preventDefault();
  }
  function onEnd(e) {
    if (e.changedTouches) {
      const ended = [...e.changedTouches].some((c) => c.identifier === pid);
      if (!ended && pid !== 'mouse') return;
    }
    pid = null;
    joy.x = 0; joy.y = 0;
    setKnob(0, 0);
  }
  base.addEventListener('touchstart', onStart, { passive: false });
  base.addEventListener('touchmove', onMove, { passive: false });
  base.addEventListener('touchend', onEnd);
  base.addEventListener('touchcancel', onEnd);
}
bindJoystick();

// look zone
(function bindLook() {
  let pid = null;
  let lx = 0, ly = 0;
  el.lookZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    pid = t.identifier;
    lx = t.clientX; ly = t.clientY;
    e.preventDefault();
  }, { passive: false });
  el.lookZone.addEventListener('touchmove', (e) => {
    const t = [...e.changedTouches].find((c) => c.identifier === pid);
    if (!t) return;
    mouse.dx += t.clientX - lx;
    mouse.dy += t.clientY - ly;
    lx = t.clientX; ly = t.clientY;
    e.preventDefault();
  }, { passive: false });
  el.lookZone.addEventListener('touchend', () => { pid = null; });
})();

el.btnFire.addEventListener('touchstart', (e) => {
  e.preventDefault();
  firing = true;
  shoot();
}, { passive: false });
el.btnFire.addEventListener('touchend', () => { firing = false; });
el.btnFire.addEventListener('mousedown', (e) => {
  e.preventDefault();
  firing = true;
  shoot();
});
el.btnFire.addEventListener('mouseup', () => { firing = false; });
el.btnReload.addEventListener('click', (e) => { e.preventDefault(); tryReload(); });
el.btnReload.addEventListener('touchstart', (e) => { e.preventDefault(); tryReload(); }, { passive: false });

document.getElementById('btn-pause').addEventListener('click', pauseGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-menu').addEventListener('click', goMenu);
document.getElementById('btn-menu2').addEventListener('click', goMenu);
document.getElementById('btn-menu3').addEventListener('click', goMenu);
document.getElementById('btn-next').addEventListener('click', () => {
  const next = levelIndex + 1;
  if (next < 10 && next + 1 <= progress.unlocked) startLevel(next);
  else goMenu();
});
document.getElementById('btn-retry').addEventListener('click', () => startLevel(levelIndex));
document.getElementById('btn-reset-progress').addEventListener('click', () => {
  progress = { unlocked: 1, cleared: [] };
  saveProgress(progress);
  renderLevelSelect();
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// boot
clearWorld();
showOverlay('menu');
renderLevelSelect();
clock.start();
tick();
