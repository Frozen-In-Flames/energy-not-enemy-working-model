/* Energy Not Enemy: The Working Model, hand-rolled WebGL scene.
 * No rendering library. Every mesh is generated from the specification's
 * dimensions (SPEC.md): 40 m2 of Fresnel lens in 1 m2 modules (B-46, B-66),
 * 0.67 m2 receiver (B-47), 51 m2 of passive condenser in 12 panels (B-49),
 * an 11-stage Tesla valve (A-11), and a boiler vessel of 1.6 m3 (A-29).
 * All animation state comes from the solver's step record. */
(function (global) {
'use strict';

/* ---------- small matrix library ---------- */
function mIdent() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function mTrans(x, y, z) { var m = mIdent(); m[12]=x; m[13]=y; m[14]=z; return m; }
function mScale(x, y, z) { var m = mIdent(); m[0]=x; m[5]=y; m[10]=z; return m; }
function mRotX(a) { var c=Math.cos(a), s=Math.sin(a);
  return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; }
function mRotY(a) { var c=Math.cos(a), s=Math.sin(a);
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
function mRotZ(a) { var c=Math.cos(a), s=Math.sin(a);
  return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; }
function mPersp(fovy, aspect, near, far) {
  var f = 1/Math.tan(fovy/2), nf = 1/(near-far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function mLookAt(eye, ctr, up) {
  var zx = eye[0]-ctr[0], zy = eye[1]-ctr[1], zz = eye[2]-ctr[2];
  var zl = Math.hypot(zx, zy, zz); zx/=zl; zy/=zl; zz/=zl;
  var xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
  var xl = Math.hypot(xx, xy, xz) || 1; xx/=xl; xy/=xl; xz/=xl;
  var yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
    -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
    -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
    -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1];
}
function vTransform(m, v) {
  var x=v[0], y=v[1], z=v[2];
  var w = m[3]*x + m[7]*y + m[11]*z + m[15];
  return [(m[0]*x + m[4]*y + m[8]*z + m[12])/w,
          (m[1]*x + m[5]*y + m[9]*z + m[13])/w,
          (m[2]*x + m[6]*y + m[10]*z + m[14])/w];
}

/* ---------- mesh builders ---------- */
function Mesh() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
Mesh.prototype.quad = function (a, b, c, d, n, col) {
  var s = this.pos.length / 3;
  this.pos.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], d[0],d[1],d[2]);
  for (var i = 0; i < 4; i++) { this.nor.push(n[0],n[1],n[2]); this.col.push(col[0],col[1],col[2]); }
  this.idx.push(s, s+1, s+2, s, s+2, s+3);
};
Mesh.prototype.box = function (cx, cy, cz, w, h, d, col) {
  var x0=cx-w/2, x1=cx+w/2, y0=cy-h/2, y1=cy+h/2, z0=cz-d/2, z1=cz+d/2;
  this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],col);
  this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],col);
  this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],col);
  this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],col);
  this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],col);
  this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],col);
};
Mesh.prototype.cyl = function (cx, cy, cz, r, h, seg, col, axis) {
  axis = axis || 'y';
  for (var i = 0; i < seg; i++) {
    var a0 = i/seg*Math.PI*2, a1 = (i+1)/seg*Math.PI*2;
    var p = function (a, t) {
      var c = Math.cos(a)*r, s = Math.sin(a)*r;
      if (axis === 'y') return [cx+c, cy-h/2+t*h, cz+s];
      if (axis === 'z') return [cx+c, cy+s, cz-h/2+t*h];
      return [cx-h/2+t*h, cy+c, cz+s];
    };
    var n = function (a) {
      var c = Math.cos(a), s = Math.sin(a);
      if (axis === 'y') return [c,0,s];
      if (axis === 'z') return [c,s,0];
      return [0,c,s];
    };
    var s0 = this.pos.length/3;
    var A=p(a0,0), B=p(a1,0), C=p(a1,1), D=p(a0,1), na=n(a0), nb=n(a1);
    this.pos.push(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], D[0],D[1],D[2]);
    this.nor.push(na[0],na[1],na[2], nb[0],nb[1],nb[2], nb[0],nb[1],nb[2], na[0],na[1],na[2]);
    for (var j = 0; j < 4; j++) this.col.push(col[0],col[1],col[2]);
    this.idx.push(s0, s0+1, s0+2, s0, s0+2, s0+3);
  }
  // caps
  var ctr0, ctr1, n0, n1;
  if (axis === 'y') { ctr0=[cx,cy-h/2,cz]; ctr1=[cx,cy+h/2,cz]; n0=[0,-1,0]; n1=[0,1,0]; }
  else if (axis === 'z') { ctr0=[cx,cy,cz-h/2]; ctr1=[cx,cy,cz+h/2]; n0=[0,0,-1]; n1=[0,0,1]; }
  else { ctr0=[cx-h/2,cy,cz]; ctr1=[cx+h/2,cy,cz]; n0=[-1,0,0]; n1=[1,0,0]; }
  var cap = function (ctr, n, flip) {
    for (var i = 0; i < seg; i++) {
      var a0=i/seg*Math.PI*2, a1=(i+1)/seg*Math.PI*2;
      var pt = function (a) {
        var c=Math.cos(a)*r, s=Math.sin(a)*r;
        if (axis==='y') return [cx+c, ctr[1], cz+s];
        if (axis==='z') return [cx+c, cy+s, ctr[2]];
        return [ctr[0], cy+c, cz+s];
      };
      var s0 = this.pos.length/3;
      var A=pt(a0), B=pt(a1);
      this.pos.push(ctr[0],ctr[1],ctr[2], A[0],A[1],A[2], B[0],B[1],B[2]);
      for (var j=0;j<3;j++){ this.nor.push(n[0],n[1],n[2]); this.col.push(col[0],col[1],col[2]); }
      if (flip) this.idx.push(s0, s0+2, s0+1); else this.idx.push(s0, s0+1, s0+2);
    }
  }.bind(this);
  cap(ctr1, n1, false); cap(ctr0, n0, true);
};
Mesh.prototype.tube = function (pts, r, col, seg) {
  seg = seg || 8;
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i+1];
    var dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
    var len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    // Build a cylinder from a to b via midpoint + orientation basis.
    var mid = [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2];
    var up = Math.abs(dy/len) > 0.9 ? [1,0,0] : [0,1,0];
    var ux = up[0], uy = up[1], uz = up[2];
    var xx = uy*dz/len - uz*dy/len, xy = uz*dx/len - ux*dz/len, xz = ux*dy/len - uy*dx/len;
    var xl = Math.hypot(xx, xy, xz); xx/=xl; xy/=xl; xz/=xl;
    var yx = (dy/len)*xz - (dz/len)*xy, yy = (dz/len)*xx - (dx/len)*xz, yz = (dx/len)*xy - (dy/len)*xx;
    for (var j = 0; j < seg; j++) {
      var a0 = j/seg*Math.PI*2, a1 = (j+1)/seg*Math.PI*2;
      var ring = function (ang, t) {
        var c = Math.cos(ang)*r, s = Math.sin(ang)*r;
        var px = mid[0] + xx*c + yx*s + (dx/len)*(t-0.5)*len;
        var py = mid[1] + xy*c + yy*s + (dy/len)*(t-0.5)*len;
        var pz = mid[2] + xz*c + yz*s + (dz/len)*(t-0.5)*len;
        return [px, py, pz];
      };
      var s0 = this.pos.length/3;
      var A=ring(a0,0), B=ring(a1,0), C=ring(a1,1), D=ring(a0,1);
      this.pos.push(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], D[0],D[1],D[2]);
      var nr = function (ang) {
        var c=Math.cos(ang), s=Math.sin(ang);
        return [xx*c+yx*s, xy*c+yy*s, xz*c+yz*s];
      };
      var na=nr(a0), nb=nr(a1);
      this.nor.push(na[0],na[1],na[2], nb[0],nb[1],nb[2], nb[0],nb[1],nb[2], na[0],na[1],na[2]);
      for (var q=0;q<4;q++) this.col.push(col[0],col[1],col[2]);
      this.idx.push(s0, s0+1, s0+2, s0, s0+2, s0+3);
    }
  }
};

/* ---------- scene layout (meters, ground plane y=0) ---------- */
var LAYOUT = {
  arrayCenter: [0, 1.35, 0], arrayW: 8, arrayD: 5,
  receiver: [0, 4.55, 0],
  boiler: [5.6, 1.05, -0.6],
  valve: [3.1, 1.05, 2.2],
  turbine: [5.6, 1.05, 2.2],
  generator: [5.6, 1.05, 4.3],
  condenser: [-4.6, 0, 1.6],
  pump: [3.4, 0.45, -2.6]
};
var VALVE_PATH = (function () {
  // Serpentine path through the valve interior (local coords, valve at origin).
  var pts = [];
  var rows = 6, x0 = -1.05, dx = 0.21, z0 = -0.28;
  for (var rI = 0; rI < rows; rI++) {
    var z = z0 + rI * 0.112;
    if (rI % 2 === 0) { pts.push([x0, 0, z]); pts.push([x0 + dx*10, 0, z]); }
    else { pts.push([x0 + dx*10, 0, z]); pts.push([x0, 0, z]); }
  }
  return pts;
})();

function buildScene(gl) {
  var parts = {};
  function buf(mesh) {
    var b = {};
    b.vao = null;
    b.pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.pos), gl.STATIC_DRAW);
    b.nor = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b.nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.nor), gl.STATIC_DRAW);
    b.col = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.col), gl.STATIC_DRAW);
    b.idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
    b.count = mesh.idx.length;
    return b;
  }
  function reg(id, label, anchor, draws) {
    parts[id] = { id: id, label: label, anchor: anchor, draws: draws };
  }
  var STEEL = [0.55, 0.58, 0.62], DARK = [0.25, 0.27, 0.30],
      COPPER = [0.72, 0.42, 0.25], LENS = [0.65, 0.82, 0.95],
      FRAME = [0.35, 0.32, 0.28], PANEL = [0.45, 0.55, 0.60];

  /* Fresnel array: 40 modules of 1 m2 in an 8 by 5 grid, each a shallow
     parabolic-profile surface, on posts, plus 4 boost mirrors. */
  var arrayMesh = new Mesh();
  var mod = 1.0, gap = 0.04;
  for (var ix = 0; ix < 8; ix++) for (var iz = 0; iz < 5; iz++) {
    var cx = -3.5 + ix * 1.0, cz = -2.0 + iz * 1.0;
    var segN = 4;
    for (var sx = 0; sx < segN; sx++) for (var sz = 0; sz < segN; sz++) {
      var fx = function (u) { return cx - mod/2 + gap + u * (mod - 2*gap); };
      var fy = function (v) { return cz - mod/2 + gap + v * (mod - 2*gap); };
      var fz = function (u, v) {
        var px = u - 0.5, pz = v - 0.5;
        return 0.10 * (px*px + pz*pz) * 4; // parabolic profile, 0.1 m rise
      };
      var u0 = sx/segN, u1 = (sx+1)/segN, v0 = sz/segN, v1 = (sz+1)/segN;
      var A=[fx(u0), fz(u0,v0), fy(v0)], B=[fx(u1), fz(u1,v0), fy(v0)],
          C=[fx(u1), fz(u1,v1), fy(v1)], D=[fx(u0), fz(u0,v1), fy(v1)];
      // normal approximated upward-biased
      arrayMesh.quad(A, B, C, D, [0, 1, 0], LENS);
    }
    arrayMesh.box(cx, -0.05, cz, mod-0.02, 0.05, mod-0.02, FRAME);
  }
  // posts and boost mirrors are part of the array group visually
  var postMesh = new Mesh();
  [[-3.6,-2.1],[3.6,-2.1],[-3.6,2.1],[3.6,2.1]].forEach(function (p) {
    postMesh.cyl(p[0], 0.65, p[1], 0.09, 1.3, 8, FRAME, 'y');
  });
  // boost mirrors on posts around the array
  var mirrorMesh = new Mesh();
  [[-5.4,-3.4],[5.4,-3.4],[-5.4,3.4],[5.4,3.4]].forEach(function (p) {
    mirrorMesh.cyl(p[0], 1.1, p[1], 0.07, 2.2, 8, FRAME, 'y');
    mirrorMesh.box(p[0], 2.35, p[1], 1.5, 1.1, 0.05, [0.85, 0.9, 0.95]);
  });
  reg('fresnel', 'Fresnel array, 40 m²', [0, 2.0, 0], [
    { buf: buf(arrayMesh), dyn: 'arrayTilt' },
    { buf: buf(postMesh), dyn: null },
    { buf: buf(mirrorMesh), dyn: 'mirrorTilt' }
  ]);

  /* Receiver: cavity cone + absorber cylinder at the focal point, on a post. */
  var recMesh = new Mesh();
  recMesh.cyl(0, -1.75, 0, 0.10, 3.1, 8, FRAME, 'y'); // post below focal point
  var recHot = new Mesh();
  recHot.cyl(0, 0, 0, 0.46, 0.55, 20, [0.9, 0.45, 0.2], 'y');
  recHot.cyl(0, -0.38, 0, 0.20, 0.22, 12, DARK, 'y');
  reg('receiver', 'Receiver, 0.67 m²', LAYOUT.receiver, [
    { buf: buf(recMesh), dyn: 'atReceiverPost' },
    { buf: buf(recHot), dyn: 'receiverHot' }
  ]);

  /* Boiler: horizontal capsule, 1.6 m3 vessel (A-29), sight glass. */
  var boMesh = new Mesh();
  boMesh.cyl(0, 0, 0, 0.62, 1.9, 20, STEEL, 'z');
  boMesh.cyl(-0.45, -0.75, -0.5, 0.07, 0.55, 8, DARK, 'y');
  boMesh.cyl(0.45, -0.75, -0.5, 0.07, 0.55, 8, DARK, 'y');
  boMesh.cyl(-0.45, -0.75, 0.5, 0.07, 0.55, 8, DARK, 'y');
  boMesh.cyl(0.45, -0.75, 0.5, 0.07, 0.55, 8, DARK, 'y');
  boMesh.cyl(0, 0.72, 0, 0.09, 0.25, 8, COPPER, 'y'); // steam outlet
  var glassMesh = new Mesh();
  glassMesh.cyl(0, 0, 0, 0.055, 1.0, 10, [0.4, 0.7, 1.0], 'y');
  reg('boiler', 'Boiler vessel', LAYOUT.boiler, [
    { buf: buf(boMesh), dyn: 'atBoiler' },
    { buf: buf(glassMesh), dyn: 'sightGlass' }
  ]);

  /* Tesla valve: frame enclosure (front open), serpentine stages, each stage
     drawn separately so the cutaway can spread. */
  var valveDraws = [];
  var backMesh = new Mesh();
  backMesh.box(0, 0, -0.42, 2.6, 1.1, 0.06, DARK);
  backMesh.box(0, 0.62, 0, 2.6, 0.08, 0.9, FRAME);
  backMesh.box(0, -0.62, 0, 2.6, 0.08, 0.9, FRAME);
  backMesh.box(-1.32, 0, 0, 0.08, 1.3, 0.9, FRAME);
  backMesh.box(1.32, 0, 0, 0.08, 1.3, 0.9, FRAME);
  valveDraws.push({ buf: buf(backMesh), dyn: 'atValve' });
  for (var sI = 0; sI < 11; sI++) {
    var stMesh = new Mesh();
    // one serpentine loop stage: a U channel segment + baffle tooth
    var xBase = -1.05 + sI * 0.21;
    stMesh.box(xBase, 0.28, -0.05, 0.09, 0.62, 0.55, COPPER);
    stMesh.box(xBase, -0.28, 0.12, 0.09, 0.62, 0.4, COPPER);
    stMesh.box(xBase + 0.09, 0, 0.30, 0.2, 0.1, 0.12, STEEL);
    valveDraws.push({ buf: buf(stMesh), dyn: 'valveStage', stage: sI });
  }
  var chanMesh = new Mesh();
  chanMesh.tube(VALVE_PATH.map(function (p) { return [p[0], p[1], p[2]]; }),
                0.045, [0.95, 0.8, 0.5], 6);
  valveDraws.push({ buf: buf(chanMesh), dyn: 'atValve' });
  reg('valve', 'Tesla valve, 11 stages', LAYOUT.valve, valveDraws);

  /* Turbine: casing + visible rotor with blades on a shaft. */
  var tbMesh = new Mesh();
  tbMesh.cyl(0, 0, 0, 0.55, 0.7, 20, STEEL, 'z');
  tbMesh.cyl(0, -0.75, -0.2, 0.07, 0.5, 8, DARK, 'y');
  tbMesh.cyl(0, -0.75, 0.2, 0.07, 0.5, 8, DARK, 'y');
  var rotorMesh = new Mesh();
  rotorMesh.cyl(0, 0, 0.95, 0.07, 3.0, 10, DARK, 'z'); // shaft toward generator
  for (var bI = 0; bI < 12; bI++) {
    var ang = bI / 12 * Math.PI * 2;
    // Bake each blade's rotation directly into the rotor mesh.
    var c = Math.cos(ang), s2 = Math.sin(ang);
    var corners = [[-0.15,-0.05],[0.15,-0.05],[0.15,0.05],[-0.15,0.05]];
    var top = [], bot = [];
    corners.forEach(function (cn) {
      var lx = 0.34 + cn[0], ly = cn[1];
      top.push([lx*c - ly*s2, lx*s2 + ly*c, 0.08]);
      bot.push([lx*c - ly*s2, lx*s2 + ly*c, -0.08]);
    });
    rotorMesh.quad(top[0], top[1], top[2], top[3], [0,0,1], [0.85,0.6,0.25]);
    rotorMesh.quad(bot[3], bot[2], bot[1], bot[0], [0,0,-1], [0.85,0.6,0.25]);
    rotorMesh.quad(top[3], top[2], bot[2], bot[3],
      [top[2][0], top[2][1], 0], [0.8,0.55,0.22]);
    rotorMesh.quad(bot[1], bot[0], top[0], top[1],
      [-top[0][0], -top[0][1], 0], [0.8,0.55,0.22]);
  }
  reg('turbine', 'Steam turbine', LAYOUT.turbine, [
    { buf: buf(tbMesh), dyn: 'atTurbine' },
    { buf: buf(rotorMesh), dyn: 'rotor' }
  ]);

  /* Generator: finned cylinder behind the turbine on the same shaft line. */
  var genMesh = new Mesh();
  genMesh.cyl(0, 0, 0, 0.48, 1.1, 18, [0.3, 0.45, 0.6], 'z');
  for (var fI = 0; fI < 8; fI++) {
    var fa = fI / 8 * Math.PI * 2;
    genMesh.box(Math.cos(fa) * 0.52, Math.sin(fa) * 0.52, 0, 0.08, 0.08, 1.0,
                [0.25, 0.38, 0.5]);
  }
  var genDisc = new Mesh();
  genDisc.cyl(0, 0, 0, 0.30, 0.08, 16, [1.0, 0.8, 0.2], 'z');
  genDisc.box(0, 0.22, 0, 0.1, 0.2, 0.1, [1.0, 0.5, 0.1]);
  reg('generator', 'Generator, 7 kW class', LAYOUT.generator, [
    { buf: buf(genMesh), dyn: 'atGenerator' },
    { buf: buf(genDisc), dyn: 'genDisc' }
  ]);

  /* Condenser: 12 finned panels in two banks, 51 m2 total (B-49). */
  var condMesh = new Mesh();
  for (var pI = 0; pI < 12; pI++) {
    var row = Math.floor(pI / 6), colI = pI % 6;
    var px = -1.95 + colI * 0.78, pz = row === 0 ? -0.85 : 0.85;
    var py = 1.05;
    condMesh.box(px, py, pz, 0.72, 1.9, 0.06, PANEL);
    for (var fin = 0; fin < 5; fin++)
      condMesh.box(px, py - 0.75 + fin * 0.38, pz + (row === 0 ? -0.05 : 0.05),
                   0.72, 0.05, 0.04, DARK);
    condMesh.cyl(px - 0.3, 0.45, pz, 0.05, 0.9, 6, FRAME, 'y');
    condMesh.cyl(px + 0.3, 0.45, pz, 0.05, 0.9, 6, FRAME, 'y');
  }
  reg('condenser', 'Condenser, 51 m²', LAYOUT.condenser, [
    { buf: buf(condMesh), dyn: 'atCondenser' }
  ]);

  /* Pipes: the loop. Receiver down to boiler; boiler to valve; valve to
     turbine; turbine exhaust to condenser; condenser return via pump. */
  var pipeMesh = new Mesh();
  var PC = [0.62, 0.5, 0.38];
  pipeMesh.tube([[0, 4.3, 0], [1.8, 3.4, -0.3], [4.2, 1.9, -0.6],
                 [5.6, 1.75, -0.6]], 0.09, PC);
  pipeMesh.tube([[5.6, 1.8, -0.6], [5.0, 1.6, 1.2], [4.45, 1.05, 2.2]],
                0.09, PC); // boiler -> valve inlet (valve at x 3.1 + 1.35)
  pipeMesh.tube([[1.75, 1.05, 2.2], [2.6, 1.0, 2.5], [4.4, 1.0, 2.3],
                 [5.15, 1.05, 2.2]], 0.09, PC); // valve outlet -> turbine inlet
  pipeMesh.tube([[5.6, 0.6, 2.2], [5.9, 0.5, 0.6], [4.0, 0.5, -1.8],
                 [-1.0, 0.6, 0.4], [-3.2, 0.8, 1.2]], 0.085, PC); // exhaust -> condenser
  pipeMesh.tube([[-4.4, 0.35, 0.6], [-2.0, 0.35, -1.6], [1.6, 0.4, -2.6],
                 [3.4, 0.45, -2.6]], 0.07, [0.4, 0.55, 0.7]); // return to pump
  pipeMesh.tube([[3.4, 0.45, -2.6], [4.8, 0.6, -1.6], [5.6, 0.7, -0.9]],
                0.07, [0.4, 0.55, 0.7]); // pump -> boiler
  var pumpMesh = new Mesh();
  pumpMesh.cyl(0, 0, 0, 0.28, 0.4, 12, [0.35, 0.5, 0.65], 'y');
  pumpMesh.box(0, -0.3, 0, 0.7, 0.15, 0.7, DARK);
  reg('loop', 'Loop piping and feed pump', [3.4, 0.6, -2.6], [
    { buf: buf(pipeMesh), dyn: null },
    { buf: buf(pumpMesh), dyn: 'atPump' }
  ]);

  /* Ground */
  var gMesh = new Mesh();
  gMesh.quad([-16, 0, -12], [16, 0, -12], [16, 0, 12], [-16, 0, 12],
             [0, 1, 0], [0.42, 0.45, 0.36]);
  reg('ground', 'Ground', [0, 0, 0], [{ buf: buf(gMesh), dyn: null }]);

  return parts;
}

/* Flow path polylines in world space. */
var POWER_PATH = [
  [5.6, 1.85, -0.6], [5.0, 1.6, 1.2], [4.45, 1.05, 2.2],
  [3.1, 1.05, 2.2], /* into valve box, serpentine handled separately */
  [1.75, 1.05, 2.2], [2.6, 1.0, 2.2], [4.4, 1.0, 2.2], [5.6, 1.05, 2.2],
  [5.75, 0.6, 1.4], [5.9, 0.5, 0.6], [4.0, 0.5, -1.8], [-1.0, 0.6, 0.4],
  [-3.2, 0.9, 1.2], [-4.2, 1.3, 1.6]
];
var RETURN_PATH = [
  [-4.4, 0.5, 0.9], [-2.0, 0.35, -1.6], [1.6, 0.4, -2.6], [3.4, 0.45, -2.6],
  [4.8, 0.6, -1.6], [5.6, 0.75, -0.95]
];
function pathPoint(path, s) {
  var total = 0, lens = [];
  for (var i = 0; i < path.length - 1; i++) {
    var l = Math.hypot(path[i+1][0]-path[i][0], path[i+1][1]-path[i][1],
                       path[i+1][2]-path[i][2]);
    lens.push(l); total += l;
  }
  var d = s * total;
  for (var j = 0; j < lens.length; j++) {
    if (d <= lens[j]) {
      var f = lens[j] > 0 ? d / lens[j] : 0;
      return [path[j][0] + (path[j+1][0]-path[j][0]) * f,
              path[j][1] + (path[j+1][1]-path[j][1]) * f,
              path[j][2] + (path[j+1][2]-path[j][2]) * f];
    }
    d -= lens[j];
  }
  return path[path.length - 1];
}

global.ENE_GL_INTERNALS = {
  mIdent: mIdent, mMul: mMul, mTrans: mTrans, mScale: mScale, mRotX: mRotX,
  mRotY: mRotY, mRotZ: mRotZ, mPersp: mPersp, mLookAt: mLookAt,
  vTransform: vTransform, Mesh: Mesh, buildScene: buildScene,
  LAYOUT: LAYOUT, VALVE_PATH: VALVE_PATH, POWER_PATH: POWER_PATH,
  RETURN_PATH: RETURN_PATH, pathPoint: pathPoint
};
})(typeof window !== 'undefined' ? window : globalThis);

/* ---------- renderer ---------- */
(function (global) {
'use strict';
var VS = [
  'attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;',
  'uniform mat4 uMVP; uniform mat4 uModel; uniform float uPointSize;',
  'varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld;',
  'void main() {',
  '  vec4 wp = uModel * vec4(aPos, 1.0);',
  '  vWorld = wp.xyz;',
  '  vNor = normalize(mat3(uModel) * aNor);',
  '  vCol = aCol;',
  '  gl_Position = uMVP * wp;',
  '  gl_PointSize = uPointSize;',
  '}'
].join('\n');
var FS = [
  'precision mediump float;',
  'uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient;',
  'uniform vec3 uTint; uniform vec3 uEmissive; uniform float uAlpha;',
  'varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld;',
  'void main() {',
  '  vec3 n = normalize(vNor);',
  '  float d = max(dot(n, uSunDir), 0.0);',
  '  vec3 base = vCol * uTint;',
  '  vec3 c = base * (uAmbient + uSunColor * d) + uEmissive;',
  '  gl_FragColor = vec4(c, uAlpha);',
  '}'
].join('\n');

function createRenderer(canvas) {
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return null;
  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  var A = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    nor: gl.getAttribLocation(prog, 'aNor'),
    col: gl.getAttribLocation(prog, 'aCol')
  };
  var U = {};
  ['uMVP','uModel','uSunDir','uSunColor','uAmbient','uTint','uEmissive',
   'uAlpha','uPointSize'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.enable(gl.DEPTH_TEST);

  var parts = ENE_GL_INTERNALS.buildScene(gl);
  var L = ENE_GL_INTERNALS.LAYOUT;

  // Dynamic buffers: beams, sun point, particles.
  var dynPos = gl.createBuffer(), dynNor = gl.createBuffer(), dynCol = gl.createBuffer();
  var ptPos = gl.createBuffer(), ptCol = gl.createBuffer();

  var cam = { theta: 0.75, phi: 1.02, radius: 16.5, target: [0.4, 1.1, 0.3] };
  var camGoal = null;
  var ui = { isolated: null, explode: 0.35, pulseT: 0 };
  var rotorAngle = 0;
  var particles = []; // {leg, s, hue}
  var droplets = [];  // {x,y,z,vy}
  var spawnAcc = { power: 0, ret: 0, drop: 0, pulse: 0 };
  var valveWorld = ENE_GL_INTERNALS.VALVE_PATH.slice().reverse().map(function (p) {
    return [L.valve[0] + p[0], L.valve[1] + p[1], L.valve[2] + p[2]];
  });
  var powerPath = [];
  (function () {
    var pre = [[5.6, 1.85, -0.6], [5.0, 1.6, 1.2], [4.45, 1.05, 2.2]];
    var post = [[1.75, 1.05, 2.2], [2.6, 1.0, 2.5], [4.4, 1.0, 2.3],
      [5.6, 1.05, 2.2], [5.75, 0.6, 1.4], [5.9, 0.5, 0.6], [4.0, 0.5, -1.8],
      [-1.0, 0.6, 0.4], [-3.2, 0.9, 1.2], [-4.2, 1.3, 1.6]];
    powerPath = pre.concat(valveWorld, post);
  })();

  function bindBuf(b, loc, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function drawBuf(b, model, tint, emissive, alpha) {
    bindBuf(b.pos, A.pos, 3); bindBuf(b.nor, A.nor, 3); bindBuf(b.col, A.col, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
    gl.uniformMatrix4fv(U.uModel, false, model);
    gl.uniform3fv(U.uTint, tint); gl.uniform3fv(U.uEmissive, emissive);
    gl.uniform1f(U.uAlpha, alpha);
    gl.uniform1f(U.uPointSize, 1.0);
    if (alpha < 1.0) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    else gl.disable(gl.BLEND);
    gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
  }
  function drawDyn(posArr, norArr, colArr, mode, pointSize, alpha, emissive) {
    gl.bindBuffer(gl.ARRAY_BUFFER, dynPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posArr), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynNor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norArr), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(A.nor); gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynCol);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colArr), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(A.col); gl.vertexAttribPointer(A.col, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(U.uModel, false, ENE_GL_INTERNALS.mIdent());
    gl.uniform3fv(U.uTint, [1, 1, 1]); gl.uniform3fv(U.uEmissive, emissive);
    gl.uniform1f(U.uAlpha, alpha); gl.uniform1f(U.uPointSize, pointSize);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(mode, 0, posArr.length / 3);
    gl.disable(gl.BLEND);
  }

  var lastStep = null, simDtH = 0;
  function update(step, dtReal) {
    lastStep = step;
    if (!step) return;
    // Rotor: visual speed proportional to solver rpm (geared down 0.12 so a
    // 3,000 rpm shaft reads as fast spin instead of strobing). Zero rpm is
    // exactly zero motion: the visuals are readouts, not decoration.
    rotorAngle += (step.rpm || 0) / 60 * Math.PI * 2 * dtReal * 0.12;
    // Particles advance with simulation time.
    var adv = Math.max(simDtH, 0);
    function advance(leg, ratePerHour) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var pt = particles[i];
        if (pt.leg !== leg) continue;
        pt.s += ratePerHour * adv;
        if (pt.s >= 1) particles.splice(i, 1);
      }
    }
    if (step.turbine_flow_kg_h > 0.1) {
      spawnAcc.power += adv * (2 + step.turbine_flow_kg_h * 0.35);
      while (spawnAcc.power > 1) {
        spawnAcc.power -= 1;
        particles.push({ leg: 'power', s: 0 });
      }
      advance('power', 0.55 + step.turbine_flow_kg_h * 0.012);
    } else advance('power', 0.55);
    if (step.return_kg_h > 0.1 || step.condensed_kg_h > 0.1) {
      spawnAcc.ret += adv * (1.5 + step.return_kg_h * 0.3);
      while (spawnAcc.ret > 1) {
        spawnAcc.ret -= 1;
        particles.push({ leg: 'return', s: 0 });
      }
      advance('return', 0.5 + step.return_kg_h * 0.02);
    } else advance('return', 0.5);
    if (ui.pulseT > 0) {
      ui.pulseT -= dtReal;
      spawnAcc.pulse += dtReal * 14;
      while (spawnAcc.pulse > 1) {
        spawnAcc.pulse -= 1;
        particles.push({ leg: 'pulse', s: 0, seed: Math.random() * 10 });
      }
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var pp = particles[j];
      if (pp.leg === 'pulse') {
        // Reverse push: crawls at 1/Di of forward speed and keeps getting
        // thrown back into the loops (the swirl offset). Most never pass.
        pp.s += dtReal * 0.05;
        if (pp.s >= 1) particles.splice(j, 1);
      }
    }
    if (step.p_condenser_kw > 0.05) {
      spawnAcc.drop += adv * step.p_condenser_kw * 6;
      while (spawnAcc.drop > 1 && droplets.length < 240) {
        spawnAcc.drop -= 1;
        var colI = Math.floor(Math.random() * 12);
        var row = Math.floor(colI / 6), cc = colI % 6;
        droplets.push({
          x: L.condenser[0] - 1.95 + cc * 0.78 + (Math.random() - 0.5) * 0.5,
          y: 1.9, z: L.condenser[2] + (row === 0 ? -0.85 : 0.85),
          vy: 0
        });
      }
    }
    for (var dI = droplets.length - 1; dI >= 0; dI--) {
      var dr = droplets[dI];
      dr.vy += 3.5 * adv; dr.y -= dr.vy * adv * 3;
      if (dr.y < 0.05) droplets.splice(dI, 1);
    }
  }

  function partMatrix(dyn, step) {
    var M = ENE_GL_INTERNALS, I = M.mIdent();
    switch (dyn) {
      case 'arrayTilt': {
        var el = step ? step.solar_elev_deg : 30;
        var az = step ? step.solar_azim_deg : 180;
        var tilt = el > 0 ? (90 - Math.min(el, 80)) * Math.PI / 180 * 0.55 : 0;
        var ry = (az - 180) * Math.PI / 180 * 0.5;
        return M.mMul(M.mTrans(0, 1.35, 0),
               M.mMul(M.mRotY(ry), M.mMul(M.mRotX(tilt), M.mTrans(0, -0.0, 0))));
      }
      case 'mirrorTilt': return I;
      case 'atReceiverPost': return M.mTrans(L.receiver[0], L.receiver[1], L.receiver[2]);
      case 'receiverHot': return M.mTrans(L.receiver[0], L.receiver[1], L.receiver[2]);
      case 'atBoiler': return M.mTrans(L.boiler[0], L.boiler[1], L.boiler[2]);
      case 'sightGlass': {
        var frac = step ? Math.min(1, Math.max(0.06,
          (step.boiler_kg - step.steam_kg) / 250)) : 0.7;
        frac = 0.15 + 0.85 * frac;
        return M.mMul(M.mTrans(L.boiler[0] - 0.78, L.boiler[1] - 0.5, L.boiler[2] + 0.34),
                      M.mScale(1, frac, 1));
      }
      case 'atValve': return M.mTrans(L.valve[0], L.valve[1], L.valve[2]);
      case 'atTurbine': return M.mTrans(L.turbine[0], L.turbine[1], L.turbine[2]);
      case 'rotor':
        return M.mMul(M.mTrans(L.turbine[0], L.turbine[1], L.turbine[2]),
                      M.mRotZ(rotorAngle));
      case 'atGenerator': return M.mTrans(L.generator[0], L.generator[1], L.generator[2]);
      case 'genDisc':
        return M.mMul(M.mTrans(L.generator[0], L.generator[1], L.generator[2] - 0.60),
                      M.mRotZ(rotorAngle));
      case 'atCondenser': return M.mTrans(L.condenser[0], L.condenser[1], L.condenser[2]);
      case 'atPump': return M.mTrans(L.pump[0], L.pump[1], L.pump[2]);
      default: return I;
    }
  }

  function render(step) {
    var W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);
    var el = step ? step.solar_elev_deg : 20;
    var az = step ? step.solar_azim_deg : 180;
    var dayF = Math.max(0, Math.min(1, Math.sin(el * Math.PI / 180) * 1.6));
    var dusk = Math.max(0, 1 - Math.abs(el) / 18) * (el > -4 ? 1 : 0);
    var sky = [
      0.05 + 0.35 * dayF + 0.25 * dusk,
      0.07 + 0.5 * dayF + 0.08 * dusk,
      0.14 + 0.65 * dayF - 0.05 * dusk
    ];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var azR = az * Math.PI / 180, elR = el * Math.PI / 180;
    var sunDir = [Math.cos(elR) * Math.sin(azR), Math.sin(elR), -Math.cos(elR) * Math.cos(azR)];
    var sunI = Math.max(0, Math.sin(elR));
    gl.uniform3fv(U.uSunDir, sunDir);
    gl.uniform3fv(U.uSunColor, [0.55 + 0.4 * sunI, 0.5 + 0.38 * sunI, 0.45 + 0.3 * sunI]);
    gl.uniform3fv(U.uAmbient, [0.26 + 0.34 * dayF, 0.27 + 0.34 * dayF, 0.32 + 0.32 * dayF]);

    if (camGoal) {
      cam.target[0] += (camGoal.target[0] - cam.target[0]) * 0.08;
      cam.target[1] += (camGoal.target[1] - cam.target[1]) * 0.08;
      cam.target[2] += (camGoal.target[2] - cam.target[2]) * 0.08;
      cam.radius += (camGoal.radius - cam.radius) * 0.08;
    }
    var eye = [
      cam.target[0] + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.target[1] + cam.radius * Math.cos(cam.phi),
      cam.target[2] + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta)
    ];
    var view = ENE_GL_INTERNALS.mLookAt(eye, cam.target, [0, 1, 0]);
    var proj = ENE_GL_INTERNALS.mPersp(0.9, W / H, 0.1, 400);
    var vp = ENE_GL_INTERNALS.mMul(proj, view);
    gl.uniformMatrix4fv(U.uMVP, false, vp);

    var heatF = step ? Math.min(1, step.p_heat_kw / 14) : 0;
    var glowF = step ? Math.min(1, step.p_gross_kw / 5) : 0;
    var tempF = step ? Math.min(1, Math.max(0, (step.boiler_temp_c - 20) / 380)) : 0;

    Object.keys(parts).forEach(function (pid) {
      var part = parts[pid];
      var dimmed = ui.isolated && ui.isolated !== pid && pid !== 'ground';
      var alpha = dimmed ? 0.13 : 1.0;
      part.draws.forEach(function (dr) {
        var model, tint = [1, 1, 1], emissive = [0, 0, 0], a = alpha;
        if (dr.dyn === 'valveStage') {
          var spread = (dr.stage - 5) * ui.explode * 0.17;
          model = ENE_GL_INTERNALS.mMul(
            ENE_GL_INTERNALS.mTrans(L.valve[0], L.valve[1], L.valve[2]),
            ENE_GL_INTERNALS.mTrans(spread, 0, ui.explode * 0.35));
          if (ui.isolated === 'valve') a = 1.0;
        } else {
          model = partMatrix(dr.dyn, step);
        }
        if (dr.dyn === 'receiverHot') {
          emissive = [heatF * 0.9, heatF * 0.32, heatF * 0.05];
        }
        if (dr.dyn === 'sightGlass') {
          tint = [0.3 + tempF * 0.9, 0.55 - tempF * 0.2, 1.0 - tempF * 0.85];
          a = Math.min(1, a + 0.15);
        }
        if (dr.dyn === 'genDisc') emissive = [glowF * 0.55, glowF * 0.3, 0];
        if (dr.dyn === null && pid === 'loop') tint = [1, 1, 1];
        drawBuf(dr.buf, model, tint, emissive, a);
      });
    });

    /* Sun beams to the receiver, strength from computed irradiance. */
    if (step && step.dni_w_m2 > 5) {
      var beamA = Math.min(0.5, step.dni_w_m2 / 1000 * 0.55);
      var pos = [], nor = [], col = [];
      var tiltM = partMatrix('arrayTilt', step);
      for (var ix = 0; ix < 8; ix++) for (var iz = 0; iz < 5; iz++) {
        var local = [-3.5 + ix, 0.10, -2.0 + iz];
        var w0 = ENE_GL_INTERNALS.vTransform(tiltM, local);
        var off = [w0[0] + 0.28, w0[1], w0[2] + 0.28];
        pos.push(w0[0], w0[1], w0[2], off[0], off[1], off[2],
                 L.receiver[0], L.receiver[1] - 0.2, L.receiver[2]);
        for (var q = 0; q < 3; q++) { nor.push(0, 1, 0); col.push(1.0, 0.85, 0.4); }
      }
      gl.depthMask(false);
      drawDyn(pos, nor, col, gl.TRIANGLES, 1, beamA, [0.35, 0.22, 0.02]);
      gl.depthMask(true);
    }
    /* Sun disc (a point sprite riding the computed sun position). */
    if (el > -2) {
      var sp = [eye[0] + sunDir[0] * 180, eye[1] + sunDir[1] * 180,
                eye[2] + sunDir[2] * 180];
      // Project manually: draw through the same MVP by using world position.
      drawDyn(sp, [0, 1, 0], [1.0, 0.9, 0.5], gl.POINTS, 42,
              Math.min(1, 0.25 + dayF), [0.9, 0.75, 0.3]);
    }
    /* Flow particles. */
    if (particles.length || droplets.length) {
      var pp2 = [], pc2 = [], pn2 = [];
      particles.forEach(function (pt) {
        var pnt, colr;
        if (pt.leg === 'power') {
          pnt = ENE_GL_INTERNALS.pathPoint(powerPath, pt.s);
          var hot = step && step.superheat_c > 40;
          colr = hot ? [1.0, 0.75, 0.45] : [0.95, 0.97, 1.0];
        } else if (pt.leg === 'return') {
          pnt = ENE_GL_INTERNALS.pathPoint(ENE_GL_INTERNALS.RETURN_PATH, pt.s);
          colr = [0.35, 0.65, 1.0];
        } else {
          var rp = ENE_GL_INTERNALS.pathPoint(valveWorld.slice().reverse(), pt.s);
          var swirl = Math.sin(pt.s * 46 + pt.seed * 7) * 0.09;
          pnt = [rp[0], rp[1] + swirl, rp[2] + Math.cos(pt.s * 40 + pt.seed) * 0.07];
          colr = [1.0, 0.35, 0.15];
        }
        pp2.push(pnt[0], pnt[1], pnt[2]); pn2.push(0, 1, 0);
        pc2.push(colr[0], colr[1], colr[2]);
      });
      droplets.forEach(function (dr) {
        pp2.push(dr.x, dr.y, dr.z); pn2.push(0, 1, 0); pc2.push(0.45, 0.75, 1.0);
      });
      drawDyn(pp2, pn2, pc2, gl.POINTS, 8, 0.95, [0.25, 0.25, 0.25]);
    }
    return { vp: vp, eye: eye };
  }

  /* Pointer controls: drag orbits, wheel zooms, shift-drag pans, click picks. */
  var drag = null, moved = 0, pickCb = null;
  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.shift) {
      var s = cam.radius * 0.0016;
      var fwd = [Math.sin(cam.theta), 0, Math.cos(cam.theta)];
      var right = [fwd[2], 0, -fwd[0]];
      cam.target[0] -= right[0] * dx * s; cam.target[2] -= right[2] * dx * s;
      cam.target[1] += dy * s;
      camGoal = null;
    } else {
      cam.theta -= dx * 0.005;
      cam.phi = Math.max(0.15, Math.min(1.5, cam.phi - dy * 0.005));
    }
  });
  canvas.addEventListener('pointerup', function (e) {
    var wasClick = moved < 6;
    drag = null;
    if (wasClick && pickCb) pickCb(e);
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.radius = Math.max(4, Math.min(46, cam.radius * (1 + Math.sign(e.deltaY) * 0.09)));
    camGoal = null;
  }, { passive: false });

  return {
    gl: gl, parts: parts, cam: cam,
    update: update, render: render,
    setSimDt: function (h) { simDtH = h; },
    setExplode: function (v) { ui.explode = v; },
    setIsolated: function (pid) {
      ui.isolated = pid;
      if (pid && parts[pid]) {
        var a = parts[pid].anchor;
        camGoal = { target: [a[0], Math.max(0.8, a[1]), a[2]],
                    radius: pid === 'valve' ? 6.5 : 10.5 };
      } else {
        camGoal = { target: [0.4, 1.1, 0.3], radius: 16.5 };
      }
    },
    pulse: function () { ui.pulseT = 3.2; },
    onPick: function (cb) { pickCb = cb; },
    project: function (vp, v) {
      var ndc = ENE_GL_INTERNALS.vTransform(vp, v);
      return { x: (ndc[0] * 0.5 + 0.5) * canvas.clientWidth,
               y: (1 - (ndc[1] * 0.5 + 0.5)) * canvas.clientHeight,
               behind: ndc[2] > 1 };
    }
  };
}

global.ENE_GL = { create: createRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
