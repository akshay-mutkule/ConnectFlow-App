import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardData } from '../types';

interface MessageFlow3DModalProps {
  open: boolean;
  onClose: () => void;
  stats?: DashboardData['stats'] | null;
}

type CameraPreset = 'overview' | 'whatsapp' | 'email';
type ChannelFilter = 'all' | 'whatsapp' | 'email';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3 = new THREE.Vector3();
const _vec3Next = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 7.5, 13.5], target: [0, 1.2, -0.5] },
  whatsapp: { pos: [-8.2, 4.2, 7.2], target: [-5.2, 1.3, 1.5] },
  email: { pos: [8.2, 4.2, 7.2], target: [5.2, 1.3, 1.5] },
};

function createProceduralGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512);

  ctx.strokeStyle = '#dce3ec';
  ctx.lineWidth = 1;
  for (let i = 64; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createOctagonShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

export const MessageFlow3DModal: React.FC<MessageFlow3DModalProps> = ({
  open,
  onClose,
  stats,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const presetRef = useRef<CameraPreset>('overview');
  const transitionActiveRef = useRef<boolean>(false);
  const channelFilterRef = useRef<ChannelFilter>('all');
  const speedRef = useRef<number>(1);

  useEffect(() => {
    presetRef.current = preset;
    transitionActiveRef.current = true;
  }, [preset]);

  useEffect(() => {
    channelFilterRef.current = channelFilter;
  }, [channelFilter]);

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !canvasMountRef.current) return;
    const container = canvasMountRef.current;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f6');
    scene.fog = new THREE.Fog('#eef2f6', 18, 46);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.addEventListener('start', () => {
      transitionActiveRef.current = false;
    });

    // Studio Lighting (Warm Key + Cool Hemisphere Fill + Rim)
    const hemiLight = new THREE.HemisphereLight('#dbeafe', '#cbd5e1', 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fff7ed', 2.2);
    keyLight.position.set(9, 14, 8);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#93c5fd', 0.9);
    rimLight.position.set(-10, 8, -10);
    scene.add(rimLight);

    // Ground Floor with Procedural Texture
    const gridTex = createProceduralGridTexture();
    gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();

    const disposables: { dispose: () => void }[] = [gridTex, shadowTex, envTexture];

    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.88,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    disposables.push(floorGeo, floorMat);

    // Shared Materials (contrasting roughness/metalness across adjacent parts)
    const slateMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.72,
      metalness: 0.18,
    });
    const brushedAluminumMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.22,
      metalness: 0.9,
    });
    const whiteCeramicMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.45,
      metalness: 0.08,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#e0f2fe',
      roughness: 0.08,
      metalness: 0.0,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.35 : 1,
      ior: 1.52,
      thickness: 0.8,
      clearcoat: 1.0,
    });
    const waGreenMat = new THREE.MeshStandardMaterial({
      color: '#16a34a',
      emissive: '#15803d',
      emissiveIntensity: 0.45,
      roughness: 0.28,
      metalness: 0.2,
    });
    const emailBlueMat = new THREE.MeshStandardMaterial({
      color: '#2563eb',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.45,
      roughness: 0.28,
      metalness: 0.2,
    });
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    disposables.push(
      slateMat,
      brushedAluminumMat,
      whiteCeramicMat,
      glassMat,
      waGreenMat,
      emailBlueMat,
      contactShadowMat
    );

    const addContactShadow = (parent: THREE.Group, radius: number) => {
      const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
      const plane = new THREE.Mesh(geo, contactShadowMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.012;
      parent.add(plane);
      disposables.push(geo);
    };

    // 1. Composite Central ConnectFlow Relay Core (7 procedural parts, grounded at y=0)
    const hubGroup = new THREE.Group();
    hubGroup.position.set(0, 0, 0);
    addContactShadow(hubGroup, 2.3);

    const plinthGeo = new THREE.ExtrudeGeometry(createOctagonShape(1.55), {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    plinthGeo.rotateX(-Math.PI / 2);
    const plinthMesh = new THREE.Mesh(plinthGeo, slateMat);
    plinthMesh.position.y = 0.06;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    hubGroup.add(plinthMesh);

    const collarGeo = new THREE.CylinderGeometry(1.1, 1.25, 0.25, 32);
    const collarMesh = new THREE.Mesh(collarGeo, brushedAluminumMat);
    collarMesh.position.y = 0.46;
    collarMesh.castShadow = true;
    hubGroup.add(collarMesh);

    const columnProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.65, 0.0),
      new THREE.Vector2(0.55, 0.5),
      new THREE.Vector2(0.45, 1.2),
      new THREE.Vector2(0.58, 1.55),
      new THREE.Vector2(0.0, 1.55),
    ];
    const columnGeo = new THREE.LatheGeometry(columnProfile, 32);
    const columnMesh = new THREE.Mesh(columnGeo, whiteCeramicMat);
    columnMesh.position.y = 0.58;
    columnMesh.castShadow = true;
    hubGroup.add(columnMesh);

    const domeGeo = new THREE.SphereGeometry(0.62, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const domeMesh = new THREE.Mesh(domeGeo, glassMat);
    domeMesh.position.y = 2.08;
    hubGroup.add(domeMesh);

    const coreBeaconGeo = new THREE.OctahedronGeometry(0.26, 0);
    const coreBeaconMesh = new THREE.Mesh(coreBeaconGeo, emailBlueMat);
    coreBeaconMesh.position.y = 2.28;
    hubGroup.add(coreBeaconMesh);

    const ringGeo = new THREE.TorusGeometry(0.95, 0.045, 16, 48);
    const outerRing = new THREE.Mesh(ringGeo, brushedAluminumMat);
    outerRing.position.y = 2.25;
    outerRing.rotation.x = Math.PI / 3;
    hubGroup.add(outerRing);

    const spireGeo = new THREE.ConeGeometry(0.12, 0.7, 16);
    const spireMesh = new THREE.Mesh(spireGeo, brushedAluminumMat);
    spireMesh.position.y = 2.95;
    hubGroup.add(spireMesh);

    scene.add(hubGroup);
    disposables.push(plinthGeo, collarGeo, columnGeo, domeGeo, coreBeaconGeo, ringGeo, spireGeo);

    // 2. Helper to build Gateway Towers (WhatsApp & Email) - 5 parts each
    const buildGatewayTower = (
      x: number,
      z: number,
      accentMat: THREE.Material
    ): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      addContactShadow(g, 1.6);

      const baseGeo = new THREE.ExtrudeGeometry(createOctagonShape(1.05), {
        depth: 0.22,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
      });
      baseGeo.rotateX(-Math.PI / 2);
      const base = new THREE.Mesh(baseGeo, slateMat);
      base.position.y = 0.04;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      const bodyGeo = new THREE.CylinderGeometry(0.58, 0.72, 1.15, 24);
      const body = new THREE.Mesh(bodyGeo, whiteCeramicMat);
      body.position.y = 0.85;
      body.castShadow = true;
      g.add(body);

      const glowCollarGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 24);
      const glowCollar = new THREE.Mesh(glowCollarGeo, accentMat);
      glowCollar.position.y = 1.48;
      g.add(glowCollar);

      const dishProfile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.22, 0.05),
        new THREE.Vector2(0.48, 0.24),
        new THREE.Vector2(0.54, 0.34),
      ];
      const dishGeo = new THREE.LatheGeometry(dishProfile, 24);
      const dish = new THREE.Mesh(dishGeo, brushedAluminumMat);
      dish.position.y = 1.6;
      dish.castShadow = true;
      g.add(dish);

      const tipGeo = new THREE.SphereGeometry(0.14, 16, 16);
      const tip = new THREE.Mesh(tipGeo, accentMat);
      tip.position.y = 2.02;
      g.add(tip);

      scene.add(g);
      disposables.push(baseGeo, bodyGeo, glowCollarGeo, dishGeo, tipGeo);
      return g;
    };

    const waTower = buildGatewayTower(-5.2, 1.6, waGreenMat);
    const emailTower = buildGatewayTower(5.2, 1.6, emailBlueMat);

    // 3. Audience Group Stations (5 composite nodes)
    const audienceCoords: [number, number][] = [
      [-6.0, -4.2],
      [-3.0, -5.2],
      [0.0, -5.6],
      [3.0, -5.2],
      [6.0, -4.2],
    ];

    const audBaseGeo = new THREE.CylinderGeometry(0.55, 0.68, 0.22, 20);
    const audTowerGeo = new THREE.CylinderGeometry(0.32, 0.42, 0.85, 20);
    const audCapGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 20);
    const audBeaconGeo = new THREE.SphereGeometry(0.15, 16, 16);
    disposables.push(audBaseGeo, audTowerGeo, audCapGeo, audBeaconGeo);

    audienceCoords.forEach(([ax, az]) => {
      const node = new THREE.Group();
      node.position.set(ax, 0, az);
      addContactShadow(node, 0.95);

      const b = new THREE.Mesh(audBaseGeo, slateMat);
      b.position.y = 0.11;
      b.castShadow = true;
      node.add(b);

      const t = new THREE.Mesh(audTowerGeo, whiteCeramicMat);
      t.position.y = 0.64;
      t.castShadow = true;
      node.add(t);

      const c = new THREE.Mesh(audCapGeo, brushedAluminumMat);
      c.position.y = 1.12;
      node.add(c);

      const p = new THREE.Mesh(audBeaconGeo, slateMat);
      p.position.y = 1.28;
      node.add(p);

      scene.add(node);
    });

    // 4. Routing Conduits (TubeGeometry) + Instanced Message Packets
    const waCurves: THREE.CatmullRomCurve3[] = [];
    const emailCurves: THREE.CatmullRomCurve3[] = [];

    const addConduit = (
      points: THREE.Vector3[],
      mat: THREE.Material,
      targetList: THREE.CatmullRomCurve3[]
    ) => {
      const curve = new THREE.CatmullRomCurve3(points);
      targetList.push(curve);
      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.045, 8, false);
      const tube = new THREE.Mesh(tubeGeo, mat);
      scene.add(tube);
      disposables.push(tubeGeo);
    };

    const conduitWaMat = new THREE.MeshStandardMaterial({
      color: '#86efac',
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    });
    const conduitEmailMat = new THREE.MeshStandardMaterial({
      color: '#93c5fd',
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    });
    disposables.push(conduitWaMat, conduitEmailMat);

    // Core -> WhatsApp Tower -> Audience nodes
    addConduit(
      [
        new THREE.Vector3(-0.6, 1.4, 0.2),
        new THREE.Vector3(-2.8, 2.2, 1.1),
        new THREE.Vector3(waTower.position.x + 0.3, 1.5, waTower.position.z),
      ],
      conduitWaMat,
      waCurves
    );

    // Core -> Email Tower -> Audience nodes
    addConduit(
      [
        new THREE.Vector3(0.6, 1.4, 0.2),
        new THREE.Vector3(2.8, 2.2, 1.1),
        new THREE.Vector3(emailTower.position.x - 0.3, 1.5, emailTower.position.z),
      ],
      conduitEmailMat,
      emailCurves
    );

    audienceCoords.forEach(([ax, az], idx) => {
      if (idx <= 2) {
        addConduit(
          [
            new THREE.Vector3(waTower.position.x, 1.5, waTower.position.z - 0.4),
            new THREE.Vector3((waTower.position.x + ax) * 0.5, 2.4, (waTower.position.z + az) * 0.5),
            new THREE.Vector3(ax, 1.2, az),
          ],
          conduitWaMat,
          waCurves
        );
      }
      if (idx >= 2) {
        addConduit(
          [
            new THREE.Vector3(emailTower.position.x, 1.5, emailTower.position.z - 0.4),
            new THREE.Vector3((emailTower.position.x + ax) * 0.5, 2.4, (emailTower.position.z + az) * 0.5),
            new THREE.Vector3(ax, 1.2, az),
          ],
          conduitEmailMat,
          emailCurves
        );
      }
    });

    // InstancedMesh packets
    const packetCount = 48;
    const packetGeo = new THREE.CapsuleGeometry(0.08, 0.18, 4, 8);
    packetGeo.rotateX(Math.PI / 2);
    const packetMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.25,
      metalness: 0.15,
    });
    const instancedPackets = new THREE.InstancedMesh(packetGeo, packetMat, packetCount);
    instancedPackets.frustumCulled = false;

    const packetMeta = Array.from({ length: packetCount }, (_, i) => {
      const isWa = i % 2 === 0;
      const curves = isWa ? waCurves : emailCurves;
      const curveIndex = i % curves.length;
      return {
        channel: (isWa ? 'whatsapp' : 'email') as 'whatsapp' | 'email',
        curve: curves[curveIndex],
        t: (i / packetCount) % 1,
        speed: 0.22 + (i % 5) * 0.04,
      };
    });

    const waColor = new THREE.Color('#16a34a');
    const emailColor = new THREE.Color('#2563eb');
    for (let i = 0; i < packetCount; i++) {
      instancedPackets.setColorAt(i, packetMeta[i].channel === 'whatsapp' ? waColor : emailColor);
    }
    if (instancedPackets.instanceColor) instancedPackets.instanceColor.needsUpdate = true;
    scene.add(instancedPackets);
    disposables.push(packetGeo, packetMat);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Damped camera preset transitions
      if (transitionActiveRef.current) {
        const targetCfg = CAMERA_PRESETS[presetRef.current];
        const alpha = 1 - Math.exp(-5.0 * delta);
        _vec3.set(...targetCfg.pos);
        camera.position.lerp(_vec3, alpha);
        _vec3Next.set(...targetCfg.target);
        controls.target.lerp(_vec3Next, alpha);
        if (camera.position.distanceTo(_vec3) < 0.03) {
          transitionActiveRef.current = false;
        }
      }

      controls.update();

      // Rotate hub telemetry ring and beacon
      outerRing.rotation.z = elapsed * 0.55;
      coreBeaconMesh.rotation.y = elapsed * 0.9;

      // Advance instanced message packets
      const activeFilter = channelFilterRef.current;
      const spd = speedRef.current;
      for (let i = 0; i < packetCount; i++) {
        const meta = packetMeta[i];
        meta.t = (meta.t + delta * meta.speed * spd) % 1;
        const visible = activeFilter === 'all' || activeFilter === meta.channel;
        if (!visible) {
          _scale.set(0.0001, 0.0001, 0.0001);
          _mat4.compose(_vec3.set(0, -10, 0), _quat, _scale);
          instancedPackets.setMatrixAt(i, _mat4);
          continue;
        }
        meta.curve.getPointAt(meta.t, _vec3);
        const nextT = Math.min(1, meta.t + 0.02);
        meta.curve.getPointAt(nextT, _vec3Next);
        _dir.subVectors(_vec3Next, _vec3).normalize();
        if (_dir.lengthSq() > 0.0001) {
          _mat4.lookAt(_vec3Next, _vec3, _up);
          _quat.setFromRotationMatrix(_mat4);
        }
        _scale.set(1, 1, 1);
        _mat4.compose(_vec3, _quat, _scale);
        instancedPackets.setMatrixAt(i, _mat4);
      }
      instancedPackets.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#eef2f6] select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Minimal Top-Left Header */}
      <div
        className="fixed top-4 left-4 flex items-center gap-4 px-4 py-2.5 rounded-xl border border-slate-200/80 shadow-sm"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.92)' }}
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900 font-display">
            ConnectFlow Delivery Topology
          </h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            WA Sent: {stats?.whatsappSent ?? 0} · Email Sent: {stats?.emailsSent ?? 0} · Delivered: {stats?.successfulDeliveries ?? 0}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Close 3D Routing View"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Collapsible Bottom Control Dock (<= 15% viewport, solid/rgba surface, no backdrop-filter) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center max-w-[94vw]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 px-3 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-1.5 shadow-sm"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.94)' }}
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show Controls' : 'Hide Controls'}</span>
        </button>

        {!dockCollapsed && (
          <div
            className="flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 shadow-md"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
          >
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['overview', 'whatsapp', 'email'] as CameraPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                    preset === p
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === 'whatsapp' ? 'WhatsApp Node' : p === 'email' ? 'Email Node' : 'Overview'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['all', 'whatsapp', 'email'] as ChannelFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setChannelFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                    channelFilter === f
                      ? f === 'whatsapp'
                        ? 'bg-emerald-600 text-white'
                        : f === 'email'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSpeedMultiplier((s) => (s === 1 ? 2 : 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Speed {speedMultiplier}x
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
