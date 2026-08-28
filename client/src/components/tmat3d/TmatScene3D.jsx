import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';

const TANK_RADIUS = 0.65;
const TANK_HEIGHT = 1.68;
const TANK_Y = TANK_HEIGHT / 2 + 0.04;
const TANK_POS = [0, 0, 0.25];

/** Scene anchor points for flow lines */
const ANCHORS = {
  rain: [0.55, 1.35, -0.35],
  soil: [-1.05, 0.55, -0.15],
  tmat: [0, 0.95, 0.25],
  uplink: [1.85, 1.05, -0.55],
};

const FLOW_CURVES = [
  { id: 'rain', color: '#ffeb3b', points: [ANCHORS.rain, [0.25, 1.05, 0.05], ANCHORS.tmat] },
  { id: 'soil', color: '#8bc34a', points: [ANCHORS.soil, [-0.45, 0.75, 0.1], ANCHORS.tmat] },
  { id: 'tmat', color: '#00e5ff', points: [ANCHORS.tmat, [0.95, 1.15, 0.05], ANCHORS.uplink] },
];

function FixedCamera() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(2.85, 1.75, 3.35);
    camera.lookAt(0.15, 0.72, 0.05);
    if ('fov' in camera) {
      camera.fov = 42;
      camera.near = 0.1;
      camera.far = 40;
    }
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Label3D({ position, children, color = '#80deea', size = 0.09 }) {
  return (
    <Text
      position={position}
      fontSize={size}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.012}
      outlineColor="#0a1512"
      font={undefined}
    >
      {children}
    </Text>
  );
}

function FlowParticle({ curve, speed, offset = 0, visible = true }) {
  const ref = useRef(null);
  const path = useMemo(() => {
    const pts = curve.points.map((p) => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(pts);
  }, [curve.points]);

  useFrame((_, delta) => {
    if (!ref.current || !visible) return;
    ref.current.userData.t = ((ref.current.userData.t ?? offset) + speed * delta) % 1;
    const pt = path.getPoint(ref.current.userData.t);
    ref.current.position.copy(pt);
    const pulse = 1 + Math.sin(Date.now() * 0.006 + offset * 10) * 0.18;
    ref.current.scale.setScalar(pulse);
    ref.current.visible = visible;
  });

  if (!visible) return null;

  return (
    <mesh ref={ref} userData={{ t: offset }}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshStandardMaterial
        color={curve.color}
        emissive={curve.color}
        emissiveIntensity={3.5}
        toneMapped={false}
      />
    </mesh>
  );
}

function FlowPaths({ flowDrivers }) {
  const drivers = flowDrivers || {};
  if (!drivers.showFlow) return null;

  const speedMap = {
    rain: drivers.rainSpeed ?? 0.2,
    soil: drivers.soilSpeed ?? 0.18,
    tmat: drivers.tmatSpeed ?? 0.22,
  };
  const opacityMap = {
    rain: 0.4 + (drivers.rainIntensity ?? 0.1) * 0.6,
    soil: 0.4 + (drivers.soilIntensity ?? 0.1) * 0.6,
    tmat: 0.4 + (drivers.tmatIntensity ?? 0.1) * 0.6,
  };

  return (
    <group>
      {FLOW_CURVES.map((curve) => (
        <group key={curve.id}>
          <Line
            points={curve.points}
            color={curve.color}
            lineWidth={3}
            transparent
            opacity={opacityMap[curve.id] ?? 0.75}
          />
          <FlowParticle curve={curve} speed={speedMap[curve.id]} offset={0.1} visible />
          <FlowParticle curve={curve} speed={(speedMap[curve.id] ?? 0.2) * 1.25} offset={0.55} visible />
        </group>
      ))}
    </group>
  );
}

function RainParticles({ active, intensity = 0.5 }) {
  const count = active ? Math.round(8 + intensity * 24) : 0;
  const refs = useRef([]);

  const seeds = useMemo(
    () => Array.from({ length: 32 }, (_, i) => ({
      x: 0.35 + Math.sin(i * 1.7) * 0.35,
      z: -0.35 + Math.cos(i * 2.1) * 0.25,
      phase: i * 0.31,
      speed: 0.8 + (i % 5) * 0.15,
    })),
    []
  );

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh || i >= count) return;
      const s = seeds[i];
      const y = 2.4 - ((t * s.speed + s.phase) % 1.8);
      mesh.position.set(s.x, y, s.z);
      mesh.visible = y > 0.4;
    });
  });

  if (!active) return null;

  return (
    <group>
      {seeds.slice(0, count).map((s, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={[s.x, 2.2, s.z]}
        >
          <sphereGeometry args={[0.02, 6, 6]} />
          <meshBasicMaterial color="#ffeb3b" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function WaterSurface({ y, waterColors }) {
  const ref = useRef(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.z = Math.sin(t * 2.4) * 0.08;
    const pulse = 1 + Math.sin(t * 3.8) * 0.025;
    ref.current.scale.set(pulse, pulse, 1);
  });

  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[TANK_RADIUS * 0.52, TANK_RADIUS * 0.94, 48]} />
      <meshStandardMaterial
        color={waterColors?.water ?? '#80deea'}
        emissive={waterColors?.emissive ?? '#00e5ff'}
        emissiveIntensity={1.35}
        transparent
        opacity={0.96}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function TmatTank({ levelPct, waterColors }) {
  const fill = Math.max(0.05, Math.min(1, (levelPct ?? 45) / 100));
  const waterH = TANK_HEIGHT * fill;
  const colors = waterColors || { water: '#29b6f6', emissive: '#00bcd4', glass: '#81d4fa' };

  return (
    <group position={TANK_POS}>
      <Label3D position={[0, TANK_HEIGHT + 0.35, 0]} color="#00e5ff" size={0.1}>
        RKL-01 TMAT
      </Label3D>
      <mesh position={[0, TANK_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS, TANK_RADIUS, TANK_HEIGHT, 36, 1, true]} />
        <meshPhysicalMaterial
          color={colors.glass}
          transparent
          opacity={0.45}
          roughness={0.08}
          metalness={0.12}
          side={THREE.DoubleSide}
          transmission={0.22}
          emissive={colors.emissive}
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[0, TANK_Y, 0]}>
        <cylinderGeometry args={[TANK_RADIUS * 1.02, TANK_RADIUS * 1.02, TANK_HEIGHT, 36, 1, true]} />
        <meshBasicMaterial color="#4dd0e1" wireframe transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, waterH / 2 + 0.04, 0]}>
        <cylinderGeometry args={[TANK_RADIUS * 0.92, TANK_RADIUS * 0.92, waterH, 32]} />
        <meshStandardMaterial
          color={colors.water}
          emissive={colors.emissive}
          emissiveIntensity={0.95}
          transparent
          opacity={0.93}
          roughness={0.1}
        />
      </mesh>
      <WaterSurface y={waterH + 0.04} waterColors={colors} />
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS + 0.08, TANK_RADIUS + 0.12, 0.06, 32]} />
        <meshStandardMaterial color="#546e7a" metalness={0.45} roughness={0.45} />
      </mesh>
    </group>
  );
}

function PeatGround({ soilIntensity = 0.5 }) {
  const moist = 0.2 + (soilIntensity ?? 0.3) * 0.35;
  return (
    <group position={[-1.15, 0, -0.15]}>
      <Label3D position={[0, 0.72, 0]} color="#8bc34a" size={0.075}>
        SOIL PROBE
      </Label3D>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[0.75, 0.24, 0.55]} />
        <meshStandardMaterial
          color="#6d4c41"
          roughness={0.85}
          emissive="#2e7d32"
          emissiveIntensity={moist}
        />
      </mesh>
      {/* probe rod */}
      <mesh position={[0.12, 0.38, 0.08]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.52, 8]} />
        <meshStandardMaterial color="#90a4ae" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* sensor head */}
      <mesh position={[0.12, 0.66, 0.08]}>
        <boxGeometry args={[0.08, 0.06, 0.06]} />
        <meshStandardMaterial color="#37474f" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.12, 0.66, 0.12]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#8bc34a" emissive="#8bc34a" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RainGauge() {
  return (
    <group position={[0.55, 0, -0.35]}>
      <Label3D position={[0, 1.55, 0]} color="#ffeb3b" size={0.075}>
        RAIN GAUGE
      </Label3D>
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.3, 8]} />
        <meshStandardMaterial color="#78909c" metalness={0.65} roughness={0.35} />
      </mesh>
      {/* funnel */}
      <mesh position={[0, 1.28, 0]}>
        <cylinderGeometry args={[0.18, 0.06, 0.22, 16, 1, true]} />
        <meshStandardMaterial color="#eceff1" metalness={0.35} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* collection cup */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 16]} />
        <meshStandardMaterial color="#455a64" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

function SolarArray({ batteryPct }) {
  const glow = batteryPct != null ? 0.3 + (batteryPct / 100) * 0.7 : 0.5;
  return (
    <group position={[-1.55, 0, 0.85]} rotation={[0, 0.35, 0]}>
      <Label3D position={[0, 0.95, 0]} color="#ff9800" size={0.075}>
        SOLAR
      </Label3D>
      {/* stand */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.06, 0.7, 0.06]} />
        <meshStandardMaterial color="#546e7a" metalness={0.5} roughness={0.45} />
      </mesh>
      {/* frame */}
      <group rotation={[-0.55, 0, 0]} position={[0, 0.72, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.95, 0.04, 0.55]} />
          <meshStandardMaterial color="#263238" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[0.88, 0.02, 0.48]} />
          <meshStandardMaterial
            color="#1a237e"
            emissive="#ff9800"
            emissiveIntensity={glow * 0.35}
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
        {/* cell grid lines */}
        {[-0.22, 0, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.04, 0]}>
            <boxGeometry args={[0.02, 0.01, 0.48]} />
            <meshBasicMaterial color="#0d47a1" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function HaiwellPanel({ uplinkActive }) {
  const ledRef = useRef(null);
  useFrame(({ clock }) => {
    if (!ledRef.current) return;
    const blink = uplinkActive ? 0.6 + Math.sin(clock.getElapsedTime() * 4) * 0.4 : 0.15;
    ledRef.current.material.emissiveIntensity = blink * 2.5;
  });

  return (
    <group position={[1.35, 0, 0.15]} rotation={[0, -0.45, 0]}>
      <Label3D position={[0, 1.05, 0]} color="#b0bec5" size={0.075}>
        HAIWELL D4
      </Label3D>
      {/* enclosure */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.72, 0.14]} />
        <meshStandardMaterial color="#546e7a" metalness={0.55} roughness={0.4} />
      </mesh>
      {/* LCD screen */}
      <mesh position={[0, 0.48, 0.075]}>
        <boxGeometry args={[0.38, 0.22, 0.02]} />
        <meshStandardMaterial color="#1b5e20" emissive="#00e676" emissiveIntensity={0.85} toneMapped={false} />
      </mesh>
      {/* buttons */}
      {[-0.14, 0, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.08]}>
          <cylinderGeometry args={[0.028, 0.028, 0.02, 12]} />
          <meshStandardMaterial color="#37474f" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* status LEDs */}
      <mesh ref={ledRef} position={[-0.18, 0.62, 0.08]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      <mesh position={[0.18, 0.62, 0.08]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#ffeb3b" emissive="#ffeb3b" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function StarlinkDish({ uplinkActive }) {
  const dishRef = useRef(null);
  useFrame(({ clock }) => {
    if (!dishRef.current || !uplinkActive) return;
    dishRef.current.rotation.x = -0.35 + Math.sin(clock.getElapsedTime() * 0.8) * 0.03;
  });

  return (
    <group position={[1.85, 0, -0.55]}>
      <Label3D position={[0, 1.45, 0]} color="#e0e0e0" size={0.075}>
        STARLINK
      </Label3D>
      {/* pole */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 1.1, 10]} />
        <meshStandardMaterial color="#78909c" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* mast arm */}
      <mesh position={[0, 1.05, 0.05]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.06, 0.35, 0.06]} />
        <meshStandardMaterial color="#607d8b" metalness={0.55} roughness={0.4} />
      </mesh>
      {/* dish */}
      <group ref={dishRef} position={[0, 1.18, 0.12]} rotation={[-0.35, 0.15, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 32]} />
          <meshStandardMaterial color="#fafafa" metalness={0.25} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 16]} />
          <meshStandardMaterial color="#eceff1" metalness={0.4} roughness={0.3} />
        </mesh>
        {/* uplink glow when active */}
        {uplinkActive && (
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#00e5ff" toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function SitePlatform() {
  return (
    <group position={[0, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.1]} receiveShadow>
        <circleGeometry args={[2.1, 48]} />
        <meshStandardMaterial color="#2e4a3f" roughness={0.88} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.1]}>
        <ringGeometry args={[1.95, 2.1, 48]} />
        <meshStandardMaterial color="#3d6b5a" roughness={0.7} />
      </mesh>
    </group>
  );
}

function SceneContent({ levelPct, flowDrivers, waterColors, uplinkActive }) {
  const drivers = flowDrivers || {};
  const batteryPct = drivers.batteryPct;

  return (
    <>
      <color attach="background" args={['#142822']} />
      <fog attach="fog" args={['#142822', 8, 18]} />
      <FixedCamera />
      <hemisphereLight color="#b2ebf2" groundColor="#1b3a32" intensity={0.95} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 3]} intensity={1.65} castShadow color="#fff8e1" />
      <directionalLight position={[-2, 3, -1]} intensity={0.55} color="#80deea" />
      <pointLight position={[0, 2.2, 1.5]} intensity={1.4} color="#00e5ff" distance={10} />
      <pointLight position={[1.8, 1.2, 0.5]} intensity={0.8} color="#ffeb3b" distance={8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1e3a32" roughness={0.92} emissive="#0d2818" emissiveIntensity={0.35} />
      </mesh>
      <gridHelper args={[6, 12, '#2e7d6a', '#1a4d42']} position={[0, 0.01, 0]} />
      <SitePlatform />
      <PeatGround soilIntensity={drivers.soilIntensity} />
      <RainGauge />
      <SolarArray batteryPct={batteryPct} />
      <HaiwellPanel uplinkActive={uplinkActive} />
      <StarlinkDish uplinkActive={uplinkActive} />
      <TmatTank levelPct={levelPct} waterColors={waterColors} />
      <RainParticles active={drivers.showRain} intensity={drivers.rainIntensity} />
      <FlowPaths flowDrivers={flowDrivers} />
    </>
  );
}

export default function TmatScene3D({ levelPct, flowDrivers, waterColors, uplinkActive = true }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.35,
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <SceneContent
        levelPct={levelPct}
        flowDrivers={flowDrivers}
        waterColors={waterColors}
        uplinkActive={uplinkActive}
      />
    </Canvas>
  );
}
