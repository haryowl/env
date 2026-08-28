import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const TANK_RADIUS = 0.65;
const TANK_HEIGHT = 1.68;
const TANK_Y = TANK_HEIGHT / 2 + 0.04;

const FLOW_CURVES = [
  { id: 'rain', color: '#ffeb3b', points: [[0, 3.2, 0], [0, 2.2, 0.15], [0, 0.95, 0.35]] },
  { id: 'soil', color: '#8bc34a', points: [[-1.7, 0.22, 0.5], [-0.8, 0.55, 0.45], [0, 0.95, 0.35]] },
  { id: 'tmat', color: '#00e5ff', points: [[2.1, 0.85, 0.3], [1, 1.1, 0.4], [0, 0.95, 0.35]] },
];

function FixedCamera() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(5.2, 3.0, 5.5);
    camera.lookAt(0.4, 0.9, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
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
      <sphereGeometry args={[0.055, 12, 12]} />
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
    rain: 0.35 + (drivers.rainIntensity ?? 0.1) * 0.65,
    soil: 0.35 + (drivers.soilIntensity ?? 0.1) * 0.65,
    tmat: 0.35 + (drivers.tmatIntensity ?? 0.1) * 0.65,
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
            opacity={opacityMap[curve.id] ?? 0.7}
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
      x: (Math.sin(i * 1.7) * 0.5),
      z: 0.25 + (Math.cos(i * 2.1) * 0.35),
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
      const y = 3.4 - ((t * s.speed + s.phase) % 2.8);
      mesh.position.set(s.x, y, s.z);
      mesh.visible = y > 0.5;
    });
  });

  if (!active) return null;

  return (
    <group>
      {seeds.slice(0, count).map((s, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={[s.x, 3.2, s.z]}
        >
          <sphereGeometry args={[0.025, 6, 6]} />
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
    <group position={[0, 0, 0.3]}>
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
    <group position={[-1.8, 0, 0.5]}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[0.9, 0.3, 0.7]} />
        <meshStandardMaterial
          color="#6d4c41"
          roughness={0.85}
          emissive="#2e7d32"
          emissiveIntensity={moist}
        />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />
        <meshStandardMaterial color="#78909c" metalness={0.65} roughness={0.35} />
      </mesh>
    </group>
  );
}

function SceneContent({ levelPct, flowDrivers, waterColors }) {
  const drivers = flowDrivers || {};
  return (
    <>
      <color attach="background" args={['#142822']} />
      <fog attach="fog" args={['#142822', 14, 32]} />
      <FixedCamera />
      <hemisphereLight color="#b2ebf2" groundColor="#1b3a32" intensity={0.95} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 10, 4]} intensity={1.65} castShadow color="#fff8e1" />
      <directionalLight position={[-3, 4, -2]} intensity={0.55} color="#80deea" />
      <pointLight position={[0, 2.2, 1.8]} intensity={1.4} color="#00e5ff" distance={12} />
      <pointLight position={[2.5, 1.2, 0.5]} intensity={0.8} color="#ffeb3b" distance={10} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1e3a32" roughness={0.92} emissive="#0d2818" emissiveIntensity={0.35} />
      </mesh>
      <gridHelper args={[12, 24, '#2e7d6a', '#1a4d42']} position={[0, 0.01, 0]} />
      <PeatGround soilIntensity={drivers.soilIntensity} />
      <TmatTank levelPct={levelPct} waterColors={waterColors} />
      <RainParticles active={drivers.showRain} intensity={drivers.rainIntensity} />
      <FlowPaths flowDrivers={flowDrivers} />
    </>
  );
}

export default function TmatScene3D({ levelPct, flowDrivers, waterColors }) {
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
      <SceneContent levelPct={levelPct} flowDrivers={flowDrivers} waterColors={waterColors} />
    </Canvas>
  );
}
