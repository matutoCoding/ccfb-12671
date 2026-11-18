import { shapePolygons } from '../geometry.js';
import { initGL, compileProgram, createTarget, deleteTarget, beginPass, bindTex, readFloats } from './gl.js';
const GRID = 512;
const GUN_SAMPLES = 8; // 每侧 3 枪, 共 6
const GUNS_PER_SIDE = 3;
const SAFE_E_KV_M = 800; // 反电离阈值 ≈ 8 kV/cm
const DEAD_FRAC = 0.6; // 低于 60% 目标膜厚 = 死角
// ---------- 着色器 ----------
const F_SEED = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uMask;
void main(){ o = texture(uMask,vUv).r > 0.5 ? vec4(vUv,0.,1.) : vec4(-1.,-1.,0.,1.); }`;
const F_JFA = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSeed; uniform float uStep;
void main(){
  vec2 best = texture(uSeed, vUv).rg;
  float bd = best.x < 0. ? 1e9 : distance(vUv, best);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    if(i==0&&j==0) continue;
    vec2 s = texture(uSeed, vUv + vec2(float(i),float(j))*uStep).rg;
    if(s.x < 0.) continue;
    float d = distance(vUv, s);
    if(d < bd){ bd = d; best = s; }
  }
  o = vec4(best, 0., 1.);
}`;
const F_DIST = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSeed; uniform sampler2D uMask;
uniform float uMmPerPx; uniform float uRes;
void main(){
  float m = texture(uMask, vUv).r;
  vec2 s = texture(uSeed, vUv).rg;
  float dpx = s.x < 0. ? 0. : distance(vUv, s) * uRes;
  o = vec4(m > 0.5 ? 0. : dpx * uMmPerPx, 0., 0., 1.);
}`;
const F_NORMAL = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDist; uniform vec2 uTexel;
void main(){
  float dx = texture(uDist, vUv+vec2(uTexel.x,0.)).r - texture(uDist, vUv-vec2(uTexel.x,0.)).r;
  float dy = texture(uDist, vUv+vec2(0.,uTexel.y)).r - texture(uDist, vUv-vec2(0.,uTexel.y)).r;
  vec2 n = normalize(vec2(dx,dy) + vec2(1e-9));
  o = vec4(n, 0., 1.);
}`;
const F_CURV = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uNormal; uniform vec2 uTexel; uniform float uMmPerPx;
void main(){
  float dnx = texture(uNormal, vUv+vec2(uTexel.x,0.)).x - texture(uNormal, vUv-vec2(uTexel.x,0.)).x;
  float dny = texture(uNormal, vUv+vec2(0.,uTexel.y)).y - texture(uNormal, vUv-vec2(0.,uTexel.y)).y;
  o = vec4((dnx+dny) / (2.0*uMmPerPx), 0., 0., 1.); // 1/mm
}`;
const F_OPEN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDist; uniform sampler2D uNormal;
uniform float uMmPerPx; uniform float uRes;
const float MAXD = 500.0; // mm
void main(){
  vec2 n = texture(uNormal, vUv).xy;
  float d0 = texture(uDist, vUv).r;
  if(d0 <= 0.001){ o = vec4(0.,0.,0.,1.); return; }
  float sum = 0.;
  for(int k=0;k<8;k++){
    float ang = -1.309 + 2.618 * float(k) / 7.0; // 法线半球 ±75°
    float ca = cos(ang), sa = sin(ang);
    vec2 dir = vec2(n.x*ca - n.y*sa, n.x*sa + n.y*ca);
    vec2 p = vUv + dir * (2.0/uRes);
    float t = 0.; float clr = MAXD;
    for(int s=0;s<24;s++){
      float d = texture(uDist, p).r;
      if(d < 1.0){ clr = t; break; }
      t += d;
      if(t >= MAXD) break;
      p += dir * (d / uMmPerPx) / uRes;
    }
    sum += clr / MAXD;
  }
  o = vec4(sum/8.0, 0., 0., 1.);
}`;
const F_DEPOSIT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDist; uniform sampler2D uNormal; uniform sampler2D uCurv; uniform sampler2D uOpen;
uniform vec3 uGun[${GUN_SAMPLES}]; uniform int uCount; // xy=枪位mm, z=枪口朝向(±1)
uniform float uVolt; uniform float uTref; uniform float uMmPerPx; uniform float uRes;
uniform float uNorm;
void main(){
  float dSurf = texture(uDist, vUv).r;
  if(dSurf <= 0.001){ o = vec4(0.); return; }
  vec2 pmm = vUv * uRes * uMmPerPx;
  vec2 n = texture(uNormal, vUv).xy;
  float curv = texture(uCurv, vUv).r;
  float open = texture(uOpen, vUv).r;
  float enh = 1.0 + clamp(curv * 40.0, -0.55, 1.8); // 边角场增强 / 凹槽场削弱
  float sum = 0.; float maxE = 0.;
  for(int i=0;i<${GUN_SAMPLES};i++){
    if(i >= uCount) break;
    vec2 toP = pmm - uGun[i].xy;
    float d = max(length(toP), 30.0);
    float cosA = dot(toP/d, vec2(uGun[i].z, 0.));
    float cone = smoothstep(0.70, 0.85, cosA);      // 喷雾锥 ±30~45°
    float cosT = 0.1 + 0.9 * clamp(dot(n, -toP/d), 0.0, 1.0); // 入射角+少量绕射
    float distF = pow(clamp(250.0/d, 0.2, 3.0), 2.0); // 距离衰减
    float E = uVolt / (d/1000.0) * enh;              // 局部场强 kV/m
    maxE = max(maxE, E);
    sum += cone * cosT * distF * pow(open, 1.5) * enh;
  }
  float T = uTref * sum * uNorm; // uNorm=1/参考点通量, 自校准到目标膜厚
  o = vec4(T, maxE, open, 1.);
}`;
const F_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDep; uniform sampler2D uMask; uniform sampler2D uDist;
uniform float uTarget; uniform float uSafeE; uniform float uBandMm;
uniform vec3 uGun[${GUN_SAMPLES}]; uniform int uCount;
uniform float uMmPerPx; uniform float uRes;
vec3 cmap(float t){
  vec3 cs[9] = vec3[](
    vec3(0.19,0.21,0.58), vec3(0.27,0.46,0.71), vec3(0.45,0.68,0.82),
    vec3(0.67,0.85,0.90), vec3(1.0,1.0,0.75), vec3(0.99,0.68,0.38),
    vec3(0.96,0.43,0.26), vec3(0.84,0.19,0.15), vec3(0.65,0.0,0.15));
  t = clamp(t,0.,1.) * 8.0;
  int i = min(int(t), 7);
  return mix(cs[i], cs[i+1], fract(t));
}
void main(){
  vec2 pmm = vUv * uRes * uMmPerPx;
  float m = texture(uMask, vUv).r;
  float d = texture(uDist, vUv).r;
  vec3 col = vec3(0.045, 0.06, 0.09);
  if(m > 0.5) col = vec3(0.35, 0.40, 0.47);
  else if(d <= uBandMm){
    vec4 dep = texture(uDep, vUv);
    float T = dep.r;
    if(T < ${DEAD_FRAC} * uTarget) col = vec3(1.0, 0.1, 0.1);       // 死角标红
    else col = cmap(T / (uTarget * 1.8));
    if(dep.g > uSafeE) col = mix(col, vec3(1.0, 0.2, 0.8), 0.55);   // 反电离区域品红
  }
  for(int i=0;i<${GUN_SAMPLES};i++){
    if(i >= uCount) break;
    if(distance(pmm, uGun[i].xy) < 5.0) col = vec3(1.0);
  }
  o = vec4(col, 1.);
}`;
// ---------- 仿真器 ----------
export class Simulator {
    ctx;
    progs = {};
    canvas;
    /** 调试: 最近一次仿真的原始网格 */
    lastDep = null;
    lastDist = null;
    lastL = 0;
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = GRID;
        this.canvas.height = GRID;
        this.canvas.className = 'sim';
        const ctx = initGL(this.canvas);
        if (!ctx)
            throw new Error('WebGL2 不可用');
        this.ctx = ctx;
        const gl = ctx.gl;
        this.progs.seed = compileProgram(gl, F_SEED);
        this.progs.jfa = compileProgram(gl, F_JFA);
        this.progs.dist = compileProgram(gl, F_DIST);
        this.progs.normal = compileProgram(gl, F_NORMAL);
        this.progs.curv = compileProgram(gl, F_CURV);
        this.progs.open = compileProgram(gl, F_OPEN);
        this.progs.deposit = compileProgram(gl, F_DEPOSIT);
        this.progs.display = compileProgram(gl, F_DISPLAY);
    }
    get ready() { return this.ctx.floatOK; }
    run(input) {
        const t0 = performance.now();
        const { gl } = this.ctx;
        const { part, preset } = input;
        // --- 计算域: 工件截面 + 枪距 + 摆幅余量 ---
        const rings0 = shapePolygons(part.shape);
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const r of rings0)
            for (const p of r) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }
        const partW = maxX - minX, partH = maxY - minY;
        const L = Math.max(partW + 2 * preset.gunDistance + 200, partH + 400);
        const mmPerPx = L / GRID;
        // 最小特征尺寸 = 4px: 薄壁按等效厚度建模, 避免亚像素薄板被曲率项误判为尖角
        const tEff = Math.max(part.shape.t ?? 3, 4 * mmPerPx);
        const rings1 = shapePolygons({ ...part.shape, t: tEff });
        const centerX = preset.gunDistance + 100 + partW / 2;
        const centerY = L / 2;
        const rings = rings1.map(r => r.map(p => ({ x: p.x + centerX, y: p.y + centerY })));
        // --- 枪位: 喷房两侧固定枪排(每侧3枪), 固定枪预设仅单侧单枪 ---
        const gunXL = Math.max(30, centerX - partW / 2 - preset.gunDistance);
        const gunXR = centerX + partW / 2 + preset.gunDistance;
        const guns = [];
        let nGun = 0;
        if (preset.type === 'reciprocator') {
            // 枪排沿工件高度分布(实际喷房枪沿往复机行程均布)
            const spread = Math.max(120, partH * 0.35);
            for (const dy of [-spread, 0, spread]) {
                guns.push(gunXL, centerY + dy, 1);
                guns.push(gunXR, centerY + dy, -1);
                nGun += 2;
            }
        }
        else {
            guns.push(gunXL, centerY, 1);
            nGun = 1;
        }
        while (guns.length < GUN_SAMPLES * 3)
            guns.push(-9999, -9999, 1);
        // --- 自校准: 计算参考点(左表面中点, 法线朝左枪)的通量, 使平板基准膜厚=Tref ---
        const sstep = (x) => { const t = Math.min(1, Math.max(0, (x - 0.70) / 0.15)); return t * t * (3 - 2 * t); };
        let cref = 0;
        for (let i = 0; i < nGun; i++) {
            const gx = guns[i * 3], gy = guns[i * 3 + 1], gd = guns[i * 3 + 2];
            const tx = (centerX - partW / 2) - gx, ty = centerY - gy;
            const d = Math.max(Math.hypot(tx, ty), 30);
            const cone = sstep((tx / d) * gd);
            const cosT = 0.1 + 0.9 * Math.min(1, Math.max(0, -(tx / d) * -1)); // n=(-1,0)
            const distF = Math.pow(Math.min(3, Math.max(0.2, 250 / d)), 2);
            cref += cone * cosT * distF;
        }
        const uNorm = 1 / Math.max(cref, 0.05);
        // --- 掩膜: Canvas2D 画截面, 上传纹理 ---
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = GRID;
        maskCanvas.height = GRID;
        const c2d = maskCanvas.getContext('2d');
        c2d.fillStyle = '#000';
        c2d.fillRect(0, 0, GRID, GRID);
        c2d.fillStyle = '#fff';
        const path = new Path2D();
        for (const ring of rings) {
            // 画布 y 轴向下, 直接按世界坐标画: 纹理 vUv 空间即世界 mm 空间
            path.moveTo(ring[0].x / mmPerPx, ring[0].y / mmPerPx);
            for (let i = 1; i < ring.length; i++)
                path.lineTo(ring[i].x / mmPerPx, ring[i].y / mmPerPx);
            path.closePath();
        }
        c2d.fill(path, 'evenodd');
        // DOM 上传不支持 R8, 先取像素再按 RED/UNSIGNED_BYTE 上传
        const img = c2d.getImageData(0, 0, GRID, GRID).data;
        const maskBytes = new Uint8Array(GRID * GRID);
        for (let i = 0; i < GRID * GRID; i++)
            maskBytes[i] = img[i * 4];
        const maskTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRID, GRID, 0, gl.RED, gl.UNSIGNED_BYTE, maskBytes);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // --- GPU 通道 ---
        const targets = [];
        const mk = () => { const t = createTarget(gl, GRID, GRID); targets.push(t); return t; };
        try {
            const seedA = mk(), seedB = mk();
            const distT = mk(), normalT = mk(), curvT = mk(), openT = mk(), depT = mk();
            // 1. 种子
            beginPass(gl, this.progs.seed, seedA, GRID, GRID);
            bindTex(gl, this.progs.seed, 'uMask', maskTex, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 2. 跳泛洪
            let src = seedA, dst = seedB;
            for (let step = GRID / 2; step >= 1; step /= 2) {
                beginPass(gl, this.progs.jfa, dst, GRID, GRID);
                bindTex(gl, this.progs.jfa, 'uSeed', src.tex, 0);
                gl.uniform1f(gl.getUniformLocation(this.progs.jfa, 'uStep'), step / GRID);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                const tmp = src;
                src = dst;
                dst = tmp;
            }
            // 3. 距离场
            beginPass(gl, this.progs.dist, distT, GRID, GRID);
            bindTex(gl, this.progs.dist, 'uSeed', src.tex, 0);
            bindTex(gl, this.progs.dist, 'uMask', maskTex, 1);
            gl.uniform1f(gl.getUniformLocation(this.progs.dist, 'uMmPerPx'), mmPerPx);
            gl.uniform1f(gl.getUniformLocation(this.progs.dist, 'uRes'), GRID);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 4. 法线
            beginPass(gl, this.progs.normal, normalT, GRID, GRID);
            bindTex(gl, this.progs.normal, 'uDist', distT.tex, 0);
            gl.uniform2f(gl.getUniformLocation(this.progs.normal, 'uTexel'), 1 / GRID, 1 / GRID);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 5. 曲率
            beginPass(gl, this.progs.curv, curvT, GRID, GRID);
            bindTex(gl, this.progs.curv, 'uNormal', normalT.tex, 0);
            gl.uniform2f(gl.getUniformLocation(this.progs.curv, 'uTexel'), 1 / GRID, 1 / GRID);
            gl.uniform1f(gl.getUniformLocation(this.progs.curv, 'uMmPerPx'), mmPerPx);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 6. 开阔度(法拉第笼)
            beginPass(gl, this.progs.open, openT, GRID, GRID);
            bindTex(gl, this.progs.open, 'uDist', distT.tex, 0);
            bindTex(gl, this.progs.open, 'uNormal', normalT.tex, 1);
            gl.uniform1f(gl.getUniformLocation(this.progs.open, 'uMmPerPx'), mmPerPx);
            gl.uniform1f(gl.getUniformLocation(this.progs.open, 'uRes'), GRID);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 7. 沉积
            const freq = preset.type === 'reciprocator' ? Math.max(4, preset.frequency) : 20;
            const dwell = Math.min(2, Math.max(0.4, freq / 30)) * Math.min(2, Math.max(0.5, 2.0 / Math.max(0.5, input.conveyorSpeed)));
            const Tref = 85 * (preset.powderOutput / 180) * (preset.voltage / 70) * dwell;
            beginPass(gl, this.progs.deposit, depT, GRID, GRID);
            bindTex(gl, this.progs.deposit, 'uDist', distT.tex, 0);
            bindTex(gl, this.progs.deposit, 'uNormal', normalT.tex, 1);
            bindTex(gl, this.progs.deposit, 'uCurv', curvT.tex, 2);
            bindTex(gl, this.progs.deposit, 'uOpen', openT.tex, 3);
            gl.uniform3fv(gl.getUniformLocation(this.progs.deposit, 'uGun[0]'), guns);
            gl.uniform1i(gl.getUniformLocation(this.progs.deposit, 'uCount'), nGun);
            gl.uniform1f(gl.getUniformLocation(this.progs.deposit, 'uNorm'), uNorm);
            gl.uniform1f(gl.getUniformLocation(this.progs.deposit, 'uVolt'), preset.voltage);
            gl.uniform1f(gl.getUniformLocation(this.progs.deposit, 'uTref'), Tref);
            gl.uniform1f(gl.getUniformLocation(this.progs.deposit, 'uMmPerPx'), mmPerPx);
            gl.uniform1f(gl.getUniformLocation(this.progs.deposit, 'uRes'), GRID);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // --- 读回统计 ---
            const dep = readFloats(gl, depT);
            const dist = readFloats(gl, distT);
            this.lastDep = dep;
            this.lastDist = dist;
            this.lastL = L;
            const bandMm = 2.5 * mmPerPx;
            let sum = 0, min = Infinity, max = 0, cnt = 0, dead = 0, orange = 0;
            const samples = [];
            for (let i = 0; i < GRID * GRID; i++) {
                const d = dist[i * 4];
                if (d <= 0.001 || d > bandMm)
                    continue;
                const T = dep[i * 4], E = dep[i * 4 + 1];
                sum += T;
                cnt++;
                samples.push(T);
                if (T < min)
                    min = T;
                if (T > max)
                    max = T;
                if (T < DEAD_FRAC * part.targetThickness)
                    dead++;
                if (E > SAFE_E_KV_M)
                    orange++;
            }
            samples.sort((a, b) => a - b);
            const p05 = samples.length ? samples[Math.floor(samples.length * 0.05)] : 0;
            const avg = cnt ? sum / cnt : 0;
            const deadZonePct = cnt ? 100 * dead / cnt : 0;
            const orangePeelPct = cnt ? 100 * orange / cnt : 0;
            const orangePeelRisk = orangePeelPct > 1;
            // --- 热力图渲染到画布 ---
            beginPass(gl, this.progs.display, null, GRID, GRID);
            bindTex(gl, this.progs.display, 'uDep', depT.tex, 0);
            bindTex(gl, this.progs.display, 'uMask', maskTex, 1);
            bindTex(gl, this.progs.display, 'uDist', distT.tex, 2);
            gl.uniform3fv(gl.getUniformLocation(this.progs.display, 'uGun[0]'), guns);
            gl.uniform1i(gl.getUniformLocation(this.progs.display, 'uCount'), nGun);
            gl.uniform1f(gl.getUniformLocation(this.progs.display, 'uTarget'), part.targetThickness);
            gl.uniform1f(gl.getUniformLocation(this.progs.display, 'uSafeE'), SAFE_E_KV_M);
            gl.uniform1f(gl.getUniformLocation(this.progs.display, 'uBandMm'), 3.5 * mmPerPx);
            gl.uniform1f(gl.getUniformLocation(this.progs.display, 'uMmPerPx'), mmPerPx);
            gl.uniform1f(gl.getUniformLocation(this.progs.display, 'uRes'), GRID);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // --- 警告与判定 ---
            const warnings = [];
            if (orangePeelRisk)
                warnings.push(`枪距过近/电压过高: ${orangePeelPct.toFixed(1)}% 表面场强超过反电离阈值(8kV/cm), 有橘皮风险, 建议加大枪距或降低电压`);
            if (deadZonePct > 5)
                warnings.push(`法拉第笼效应: ${deadZonePct.toFixed(1)}% 表面上粉不足(深槽/死角), 建议降低电压、拉近枪距或手工补喷`);
            if (avg < part.targetThickness * 0.9)
                warnings.push(`平均膜厚 ${avg.toFixed(0)}μm 低于目标 ${part.targetThickness}μm, 建议提高出粉量或降低链速`);
            if (avg > part.targetThickness * 1.4)
                warnings.push(`平均膜厚 ${avg.toFixed(0)}μm 偏高, 边角积粉明显, 建议降低出粉量`);
            return {
                avgUm: avg, minUm: cnt ? min : 0, maxUm: max, p05Um: p05,
                deadZonePct, orangePeelPct, orangePeelRisk,
                runMs: performance.now() - t0,
                warnings, canvas: this.canvas,
            };
        }
        finally {
            for (const t of targets)
                deleteTarget(gl, t);
            gl.deleteTexture(maskTex);
        }
    }
}
/** 根据仿真结果判定 */
export function judge(out, target) {
    const reasons = [];
    if (out.avgUm < target * 0.9)
        reasons.push(`平均膜厚不足(${out.avgUm.toFixed(0)}μm < 90%×${target}μm)`);
    if (out.p05Um < target * 0.45)
        reasons.push(`5%分位膜厚过低(${out.p05Um.toFixed(0)}μm), 存在露底风险`);
    if (out.deadZonePct >= 5)
        reasons.push(`死角面积占比 ${out.deadZonePct.toFixed(1)}%(≥5%), 法拉第笼效应未受控`);
    if (out.orangePeelRisk)
        reasons.push(`局部场强超限, 反电离橘皮风险`);
    return { verdict: reasons.length ? '不合格' : '合格', reasons };
}
//# sourceMappingURL=simulate.js.map