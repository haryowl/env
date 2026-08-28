import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const TANK_RADIUS = 0.65;
const TANK_HEIGHT = 1.68;
const TANK_Y = TANK_HEIGHT / 2 + 0.04;

const FLOW_CURVES = [
  { color: '#ffeb3b', points: [[0, 3.2, 0], [0, 2.2, 0.15], [0, 0.95, 0.35]], speed: 0.28 },
  { color: '#8bc34a', points: [[-1.7, 0.22, 0.5], [-0.8, 0.55, 0.45], [0, 0.95, 0.35]], speed: 0.24 },
  { color: '#00e5ff', points: [[2.1, 0.85, 0.3], [1, 1.1, 0.4], [0, 0.95, 0.35]], speed: 0.33 },
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

function FlowParticle({ curve, speed, offset = 0 }) {
  const ref = useRef(null);
  const path = useMemo(() => {
    const pts = curve.points.map((p) => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(pts);
  }, [curve.points]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.userData.t = ((ref.current.userData.t ?? offset) + speed * delta) % 1;
    const pt = path.getPoint(ref.current.userData.t);
    ref.current.position.copy(pt);
    const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.15;
    ref.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={ref} userData={{ t: offset }}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial
        color={curve.color}
        emissive={curve.color}
        emissiveIntensity={2}
        toneMapped={false}
      />
    </mesh>
  );
}

function FlowPaths({ active }) {
  if (!active) return null;
  return (
    <group>
      {FLOW_CURVES.map((curve) => (
        <group key={curve.color}>
          <Line
            points={curve.points}
            color={curve.color}
            lineWidth={2}
            transparent
            opacity={0.55}
          />
          <FlowParticle curve={curve} speed={curve.speed} offset={0.1} />
          <FlowParticle curve={curve} speed={curve.speed * 1.2} offset={0.55} />
        </group>
      ))}
    </group>
  );
}

function TmatTank({ levelPct }) {
  const fill = Math.max(0.05, Math.min(1, (levelPct ?? 45) / 100));
  const waterH = TANK_HEIGHT * fill;

  return (
    <group position={[0, 0, 0.3]}>
      {/* Glass shell */}
      <mesh position={[0, TANK_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS, TANK_RADIUS, TANK_HEIGHT, 36, 1, true]} />
        <meshPhysicalMaterial
          color="#b3e5fc"
          transparent
          opacity={0.18}
          roughness={0.12}
          metalness={0.05}
          side={THREE.DoubleSide}
          transmission={0.35}
        />
      </mesh>
      {/* Water fill */}
      <mesh position={[0, waterH / 2 + 0.04, 0]}>
        <cylinderGeometry args={[TANK_RADIUS * 0.92, TANK_RADIUS * 0.92, waterH, 32]} />
        <meshStandardMaterial
          color="#0288d1"
          emissive="#01579b"
          emissiveIntensity={0.35}
          transparent
          opacity={0.78}
          roughness={0.18}
        />
      </mesh>
      {/* Water surface ring */}
      <mesh position={[0, waterH + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TANK_RADIUS * 0.55, TANK_RADIUS * 0.92, 32]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={0.55}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS + 0.08, TANK_RADIUS + 0.12, 0.06, 32]} />
        <meshStandardMaterial color="#37474f" metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}

function PeatGround() {
  return (
    <group position={[-1.8, 0, 0.5]}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[0.9, 0.3, 0.7]} />
        <meshStandardMaterial color="#3e2723" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />
        <meshStandardMaterial color="#37474f" metalness={0.8} />
      </mesh>
    </group>
  );
}

function SceneContent({ levelPct, hasLiveData }) {
  return (
    <>
      <color attach="background" args={['#070d0b']} />
      <fog attach="fog" args={['#070d0b', 8, 22]} />
      <FixedCamera />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 3]} intensity={1.1} castShadow />
      <pointLight position={[0, 2, 2]} intensity={0.6} color="#00e5ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0a1410" roughness={1} />
      </mesh>
      <PeatGround />
      <TmatTank levelPct={levelPct} />
      <FlowPaths active={hasLiveData} />
    </>
  );
}

export default function TmatScene3D({ levelPct, hasLiveData }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <SceneContent levelPct={levelPct} hasLiveData={hasLiveData} />
    </Canvas>
  );
}
