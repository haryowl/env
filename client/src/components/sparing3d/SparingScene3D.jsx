import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const CHANNEL_LEN = 10.5;
const CHANNEL_W = 1.55;
const CHANNEL_H = 0.72;
const WATER_H = 0.38;
const PROBE_XS = [-3.2, -1.05, 1.1, 3.25];
const PROBE_META = [
  { id: 'tss', label: 'TSS', color: '#a8a29e' },
  { id: 'nh3n', label: 'NH3-N', color: '#bef264' },
  { id: 'ph', label: 'PH', color: '#4FC3F7' },
  { id: 'cod', label: 'COD', color: '#94a3b8' },
];

function IsoCamera() {
  const { camera, size } = useThree();
  const primed = useRef(false);

  useLayoutEffect(() => {
    if (!camera.isOrthographicCamera) return;
    const aspect = size.width / Math.max(1, size.height);
    const frustum = 6.2;
    // Only update frustum on resize — never reset position/zoom (OrbitControls owns those).
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.near = 0.1;
    camera.far = 80;
    if (!primed.current) {
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0.2, 0);
      camera.zoom = 1;
      primed.current = true;
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/** Canvas sprite labels — Html + distanceFactor breaks under orthographic zoom. */
function makeLabelTexture(text, color, glow) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const label = String(text || '').toUpperCase();
  ctx.font = '800 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  const metrics = ctx.measureText(label);
  const padX = 36;
  const padY = 18;
  const w = Math.min(canvas.width - 16, metrics.width + padX * 2);
  const h = 64;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  ctx.fillStyle = glow ? 'rgba(190,242,100,0.22)' : 'rgba(15,23,42,0.82)';
  ctx.strokeStyle = glow ? 'rgba(190,242,100,0.7)' : 'rgba(148,163,184,0.45)';
  ctx.lineWidth = 3;
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 8;
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function Label3D({ position, children, color = '#e2e8f0', glow = false }) {
  const texture = useMemo(
    () => makeLabelTexture(children, color, glow),
    [children, color, glow]
  );

  useLayoutEffect(() => () => {
    texture.dispose();
  }, [texture]);

  return (
    <sprite position={position} scale={[1.55, 0.39, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function ConcreteChannel() {
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: '#6b7280',
      roughness: 0.82,
      metalness: 0.08,
    }),
    []
  );
  const floorMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: '#4b5563',
      roughness: 0.9,
      metalness: 0.05,
    }),
    []
  );

  return (
    <group>
      {/* floor */}
      <mesh position={[0, -CHANNEL_H / 2, 0]} receiveShadow material={floorMat}>
        <boxGeometry args={[CHANNEL_LEN, 0.12, CHANNEL_W]} />
      </mesh>
      {/* long walls */}
      <mesh position={[0, 0, CHANNEL_W / 2 + 0.06]} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[CHANNEL_LEN, CHANNEL_H, 0.12]} />
      </mesh>
      <mesh position={[0, 0, -CHANNEL_W / 2 - 0.06]} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[CHANNEL_LEN, CHANNEL_H, 0.12]} />
      </mesh>
      {/* end walls */}
      <mesh position={[CHANNEL_LEN / 2 + 0.05, 0, 0]} castShadow material={wallMat}>
        <boxGeometry args={[0.12, CHANNEL_H, CHANNEL_W + 0.24]} />
      </mesh>
      <mesh position={[-CHANNEL_LEN / 2 - 0.05, 0, 0]} castShadow material={wallMat}>
        <boxGeometry args={[0.12, CHANNEL_H, CHANNEL_W + 0.24]} />
      </mesh>
      {/* rim caps */}
      <mesh position={[0, CHANNEL_H / 2 - 0.02, CHANNEL_W / 2 + 0.14]} material={wallMat}>
        <boxGeometry args={[CHANNEL_LEN + 0.2, 0.06, 0.28]} />
      </mesh>
      <mesh position={[0, CHANNEL_H / 2 - 0.02, -CHANNEL_W / 2 - 0.14]} material={wallMat}>
        <boxGeometry args={[CHANNEL_LEN + 0.2, 0.06, 0.28]} />
      </mesh>
    </group>
  );
}

function makeFlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c4a6e';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 18; i += 1) {
    const x = i * 14;
    const grad = ctx.createLinearGradient(x, 0, x + 10, 0);
    grad.addColorStop(0, 'rgba(125,211,252,0)');
    grad.addColorStop(0.5, 'rgba(186,230,253,0.55)');
    grad.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 8, 10, 48);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

function AnimatedWater({
  flowSpeed = 0.8,
  waveAmp = 0.016,
  textureScroll = 0.014,
  tint = '#4FC3F7',
  animate = true,
}) {
  const meshRef = useRef(null);
  const matRef = useRef(null);
  const basePositions = useRef(null);
  const flowTex = useMemo(() => makeFlowTexture(), []);

  useLayoutEffect(() => {
    const geo = meshRef.current?.geometry;
    if (!geo) return;
    basePositions.current = Float32Array.from(geo.attributes.position.array);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const moving = animate && flowSpeed > 0.001;
    if (meshRef.current && basePositions.current) {
      const pos = meshRef.current.geometry.attributes.position;
      const base = basePositions.current;
      if (moving) {
        const speed = flowSpeed;
        const amp = waveAmp;
        for (let i = 0; i < pos.count; i += 1) {
          const ix = i * 3;
          const x = base[ix];
          const z = base[ix + 2];
          const wave = Math.sin(x * 1.35 + t * speed * 3.1) * amp
            + Math.sin(z * 2.6 + t * speed * 2.0) * amp * 0.55;
          pos.array[ix + 1] = base[ix + 1] + wave;
        }
      } else {
        // Flat surface when flow is zero
        for (let i = 0; i < pos.count; i += 1) {
          const ix = i * 3;
          pos.array[ix + 1] = base[ix + 1];
        }
      }
      pos.needsUpdate = true;
      meshRef.current.geometry.computeVertexNormals();
    }
    if (flowTex) {
      if (moving) flowTex.offset.x = (flowTex.offset.x - textureScroll) % 1;
    }
    if (matRef.current) {
      matRef.current.color.set(tint);
      matRef.current.emissive.set(tint);
      matRef.current.emissiveIntensity = moving ? 0.22 + Math.min(0.35, flowSpeed * 0.08) : 0.12;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, -CHANNEL_H / 2 + 0.08 + WATER_H / 2, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[CHANNEL_LEN - 0.18, WATER_H, CHANNEL_W - 0.22, 48, 1, 10]} />
      <meshPhysicalMaterial
        ref={matRef}
        color={tint}
        emissive={tint}
        emissiveIntensity={0.22}
        roughness={0.22}
        metalness={0.08}
        transmission={0.45}
        thickness={0.45}
        transparent
        opacity={0.78}
        map={flowTex}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ProbeBridge({ x, meta, accent = false, statusColor }) {
  const glow = accent || meta.id === 'nh3n';
  const labelColor = glow ? '#bef264' : (statusColor || meta.color);

  return (
    <group position={[x, 0, 0]}>
      {/* bridge beam */}
      <mesh position={[0, CHANNEL_H / 2 + 0.08, 0]} castShadow>
        <boxGeometry args={[0.14, 0.08, CHANNEL_W + 0.55]} />
        <meshStandardMaterial color="#111827" roughness={0.55} metalness={0.4} />
      </mesh>
      {/* posts */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.05, side * (CHANNEL_W / 2 + 0.18)]} castShadow>
          <boxGeometry args={[0.1, CHANNEL_H + 0.2, 0.1]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.35} />
        </mesh>
      ))}
      {/* probe body */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, CHANNEL_H * 0.85, 12]} />
        <meshStandardMaterial
          color="#1e293b"
          emissive={glow ? '#bef264' : '#000000'}
          emissiveIntensity={glow ? 0.35 : 0}
          metalness={0.55}
          roughness={0.35}
        />
      </mesh>
      {/* tip */}
      <mesh position={[0, -CHANNEL_H / 2 + 0.18, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial
          color={labelColor}
          emissive={labelColor}
          emissiveIntensity={glow ? 0.85 : 0.35}
        />
      </mesh>
      <Label3D position={[0, CHANNEL_H / 2 + 0.55, 0]} color={labelColor} glow={glow}>
        {meta.label}
      </Label3D>
    </group>
  );
}

function SonarRing({ active, x }) {
  const ref = useRef(null);
  useFrame((_, delta) => {
    if (!ref.current || !active) return;
    ref.current.userData.t = (ref.current.userData.t || 0) + delta * 0.9;
    const t = ref.current.userData.t % 1;
    const s = 0.2 + t * 1.4;
    ref.current.scale.set(s, s, s);
    ref.current.material.opacity = (1 - t) * 0.55;
    ref.current.visible = active;
  });
  if (!active) return null;
  return (
    <mesh ref={ref} position={[x, -CHANNEL_H / 2 + 0.12 + WATER_H * 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.25, 0.32, 48]} />
      <meshBasicMaterial color="#bef264" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function ParticleCloud({
  kind,
  count,
  color,
  size,
  density = 0.4,
  drift = 0.7,
  settle = 0,
  flutter = 0,
  buoyant = 0,
  enabled = true,
}) {
  const pointsRef = useRef(null);
  const matRef = useRef(null);
  const { positions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * (CHANNEL_LEN - 0.6);
      // TSS starts higher then settles; COD mid-column flutter; NH3 lower then rises
      const yBias = kind === 'tss' ? 0.55 : kind === 'cod' ? 0.4 : 0.25;
      pos[i * 3 + 1] = -CHANNEL_H / 2 + 0.12 + Math.random() * WATER_H * yBias + WATER_H * (1 - yBias) * 0.35;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (CHANNEL_W - 0.35);
    }
    return { positions: pos };
  }, [count, kind]);

  useFrame((state, delta) => {
    if (!enabled || !pointsRef.current) return;
    const attr = pointsRef.current.geometry.attributes.position;
    const arr = attr.array;
    const d = Math.max(0, Math.min(1, density));
    const activeCount = Math.max(0, Math.floor(count * d));
    const yMin = -CHANNEL_H / 2 + 0.14;
    const yMax = -CHANNEL_H / 2 + 0.1 + WATER_H * 0.92;
    const t = state.clock.elapsedTime;

    // Park inactive particles below floor (hidden)
    for (let i = activeCount; i < count; i += 1) {
      arr[i * 3 + 1] = -10;
    }

    for (let i = 0; i < activeCount; i += 1) {
      const ix = i * 3;
      if (arr[ix + 1] < -5) {
        arr[ix] = (Math.random() - 0.5) * (CHANNEL_LEN - 0.6);
        arr[ix + 1] = kind === 'tss' ? yMax - Math.random() * 0.08 : yMin + Math.random() * (yMax - yMin);
        arr[ix + 2] = (Math.random() - 0.5) * (CHANNEL_W - 0.35);
      }

      // Downstream drift — scales with flow; stagnant when drift≈0
      arr[ix] += drift * delta * (kind === 'cod' ? 1.15 : kind === 'tss' ? 0.55 : 0.8);

      if (settle > 0) {
        arr[ix + 1] -= delta * 0.22 * settle;
      }
      if (buoyant > 0) {
        arr[ix + 1] += delta * 0.18 * buoyant;
      }
      if (flutter > 0) {
        arr[ix + 1] += Math.sin(arr[ix] * 3.2 + t * (2.2 + flutter)) * delta * 0.12 * flutter;
        arr[ix + 2] += Math.cos(arr[ix] * 2.4 + t * 1.6) * delta * 0.05 * flutter;
      }

      if (arr[ix] > CHANNEL_LEN / 2 - 0.3) {
        arr[ix] = -CHANNEL_LEN / 2 + 0.3;
        arr[ix + 1] = kind === 'tss' ? yMax - Math.random() * 0.05 : yMin + Math.random() * (yMax - yMin) * 0.7;
      }
      if (arr[ix + 1] < yMin) {
        arr[ix + 1] = kind === 'tss' ? yMax : yMin + 0.02;
      }
      if (arr[ix + 1] > yMax) {
        arr[ix + 1] = kind === 'nh3' ? yMin + 0.02 : yMax - 0.02;
      }
      const zLimit = (CHANNEL_W - 0.35) / 2;
      if (arr[ix + 2] > zLimit) arr[ix + 2] = zLimit;
      if (arr[ix + 2] < -zLimit) arr[ix + 2] = -zLimit;
    }

    attr.needsUpdate = true;
    if (matRef.current) {
      matRef.current.opacity = 0.35 + d * 0.55;
      matRef.current.size = size * (0.75 + d * 0.55);
    }
  });

  if (!enabled || density < 0.02) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color={color}
        size={size}
        transparent
        opacity={0.8}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function WaterParticles({ particles, particleDrift = 0.7, enabled = true }) {
  if (!enabled) return null;
  const drift = particleDrift;
  return (
    <group>
      <ParticleCloud
        kind="tss"
        count={160}
        color="#a16207"
        size={0.095}
        density={particles?.tssDensity ?? 0.3}
        drift={drift}
        settle={particles?.tssSettle ?? 0.8}
        enabled={enabled}
      />
      <ParticleCloud
        kind="cod"
        count={180}
        color="#1c1917"
        size={0.042}
        density={particles?.codDensity ?? 0.3}
        drift={drift * 1.2}
        flutter={particles?.codFlutter ?? 0.9}
        enabled={enabled}
      />
      <ParticleCloud
        kind="nh3"
        count={120}
        color="#a3e635"
        size={0.06}
        density={particles?.nh3Density ?? 0.2}
        drift={drift * 0.9}
        buoyant={0.7 + (particles?.nh3Density ?? 0.2)}
        enabled={enabled}
      />
    </group>
  );
}

function Flowmeter({ spinRad = 4 }) {
  const impeller = useRef(null);
  useFrame((_, delta) => {
    if (impeller.current) impeller.current.rotation.x += spinRad * delta;
  });

  return (
    <group position={[CHANNEL_LEN / 2 - 0.55, -0.05, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.35, 0.55, 0.55]} />
        <meshStandardMaterial color="#1f2937" metalness={0.45} roughness={0.4} />
      </mesh>
      <group ref={impeller} position={[0, 0.05, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.08, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.4} metalness={0.6} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2, Math.PI / 2]}>
            <boxGeometry args={[0.04, 0.32, 0.06]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>
      <Label3D position={[0, 0.85, 0]} color="#7dd3fc">FLOWMETER</Label3D>
    </group>
  );
}

function CableRun() {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, CHANNEL_H / 2 + 0.12, 0.85),
      new THREE.Vector3(-1.2, CHANNEL_H / 2 + 0.35, 1.1),
      new THREE.Vector3(1.2, CHANNEL_H / 2 + 0.4, 1.05),
      new THREE.Vector3(3.2, CHANNEL_H / 2 + 0.25, 0.9),
      new THREE.Vector3(4.6, 0.55, 0.35),
    ]),
    []
  );
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 64, 0.025, 8, false), [curve]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

function Cabinet() {
  return (
    <group position={[4.85, 0.15, 1.15]}>
      <mesh castShadow>
        <boxGeometry args={[0.55, 0.95, 0.4]} />
        <meshStandardMaterial color="#111827" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0.28, 0.12, 0]}>
        <planeGeometry args={[0.32, 0.42]} />
        <meshStandardMaterial
          color="#022c22"
          emissive="#34d399"
          emissiveIntensity={0.55}
          toneMapped={false}
        />
      </mesh>
      <Label3D position={[0, 0.7, 0]} color="#34d399">CABINET</Label3D>
    </group>
  );
}

function SceneContent({
  telemetry,
  showFlow = true,
  showParticles = true,
  showGrid = true,
}) {
  const flowSpeed = telemetry?.flowSpeed ?? 0.8;
  const waveAmp = telemetry?.waveAmp ?? 0.016;
  const textureScroll = telemetry?.textureScroll ?? 0.014;
  const particleDrift = telemetry?.particleDrift ?? 0.7;
  const waterTint = telemetry?.waterTint ?? '#4FC3F7';
  const particles = telemetry?.particles;
  const status = telemetry?.status || {};
  const nh3Glow = Boolean(particles?.nh3Glow);

  return (
    <>
      <color attach="background" args={['#dce8f4']} />
      <fog attach="fog" args={['#dce8f4', 22, 48]} />
      <IsoCamera />
      <ambientLight intensity={0.95} />
      <hemisphereLight color="#ffffff" groundColor="#94a3b8" intensity={0.85} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.55}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        color="#ffffff"
      />
      <directionalLight position={[-6, 6, -4]} intensity={0.55} color="#7dd3fc" />
      {nh3Glow && (
        <pointLight
          position={[PROBE_XS[1], 0.2, 0]}
          intensity={particles?.nh3LightIntensity ?? 1.2}
          distance={5}
          color="#bef264"
        />
      )}

      {showGrid && (
        <gridHelper args={[22, 22, '#94a3b8', '#cbd5e1']} position={[0, -CHANNEL_H / 2 - 0.08, 0]} />
      )}

      <ConcreteChannel />
      <AnimatedWater
        flowSpeed={flowSpeed}
        waveAmp={waveAmp}
        textureScroll={textureScroll}
        tint={waterTint}
        animate={showFlow}
      />
      <WaterParticles
        particles={particles}
        particleDrift={particleDrift}
        enabled={showParticles}
      />

      {PROBE_META.map((meta, i) => (
        <ProbeBridge
          key={meta.id}
          x={PROBE_XS[i]}
          meta={meta}
          accent={meta.id === 'nh3n' && nh3Glow}
          statusColor={status[meta.id]?.color}
        />
      ))}
      <SonarRing active={nh3Glow} x={PROBE_XS[1]} />
      <CableRun />
      <Cabinet />
      <Flowmeter spinRad={telemetry?.impellerSpin ?? 4} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minZoom={0.55}
        maxZoom={2.4}
        minPolarAngle={0.6}
        maxPolarAngle={1.35}
        target={[0, 0.15, 0]}
      />
    </>
  );
}

export default function SparingScene3D({
  telemetry,
  showFlow = true,
  showParticles = true,
  showGrid = true,
}) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [10, 10, 10], zoom: 1, near: 0.1, far: 80 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <SceneContent
        telemetry={telemetry}
        showFlow={showFlow}
        showParticles={showParticles}
        showGrid={showGrid}
      />
    </Canvas>
  );
}
