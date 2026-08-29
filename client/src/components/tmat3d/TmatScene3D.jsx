import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

const TANK_RADIUS = 0.38;
const TANK_HEIGHT = 1.45;
/** Depth below ground surface (y=0); only casing + water column remain visible. */
const TANK_BURIED_DEPTH = 1.08;
const TANK_CENTER_Y = TANK_HEIGHT / 2 - TANK_BURIED_DEPTH;
const TANK_POS = [0, 0, 0.2];
const GROUND_Y = 0;

/** Below-ground cross-section depth (m below surface). */
const CUTAWAY_DEPTH = 1.85;
const CUTAWAY_BOTTOM = GROUND_Y - CUTAWAY_DEPTH;
const CUTAWAY_RADIUS = 0.92;

const SOIL_LAYERS = [
  { id: 'topsoil', label: 'TOPSOIL', top: 0, bottom: -0.32, color: '#5d4037', emissive: '#2e7d32' },
  { id: 'clay', label: 'CLAY', top: -0.32, bottom: -0.82, color: '#6d4c41', emissive: '#4e342e' },
  { id: 'sand', label: 'SAND / GRAVEL', top: -0.82, bottom: CUTAWAY_BOTTOM, color: '#8d6e63', emissive: '#5d4037' },
];

function useAnimatedScalar(target, fallback, speed = 0.09) {
  const valueRef = useRef(fallback);
  const initializedRef = useRef(false);

  useLayoutEffect(() => {
    if (target != null && !initializedRef.current) {
      valueRef.current = target;
      initializedRef.current = true;
    }
    if (target == null) initializedRef.current = false;
  }, [target]);

  useFrame(() => {
    const goal = target ?? fallback;
    valueRef.current = THREE.MathUtils.lerp(valueRef.current, goal, speed);
  });
  return valueRef;
}

/** Signed TMAT (m) → scene Y for underground water table (not clamped to well casing). */
function sceneWaterYFromElevation(tmatElevationM) {
  if (tmatElevationM == null || !Number.isFinite(tmatElevationM)) return null;
  return Math.max(CUTAWAY_BOTTOM + 0.05, Math.min(GROUND_Y + 0.02, GROUND_Y + tmatElevationM));
}

/** Scene anchor points — sensor → HMI hub → Starlink uplink */
const HMI_ANCHOR = [1.48, 0.48, 0.42];
const STARLINK_ANCHOR = [1.85, 1.12, -0.43];

const FLOW_CURVES = [
  { id: 'rain', color: '#ffeb3b', points: [[0.55, 1.28, -0.35], [1.05, 0.72, 0.08], HMI_ANCHOR] },
  { id: 'soil', color: '#8bc34a', points: [[-1.05, 0.55, -0.15], [-0.15, 0.48, 0.18], HMI_ANCHOR] },
  { id: 'tmat', color: '#00e5ff', points: [[0, 0.14, 0.2], [0.72, 0.34, 0.3], HMI_ANCHOR] },
  { id: 'uplink', color: '#80deea', points: [HMI_ANCHOR, [1.68, 0.82, 0.02], STARLINK_ANCHOR] },
];

function FixedCamera() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(2.75, 1.55, 3.25);
    camera.lookAt(0.1, 0.35, 0.05);
    if ('fov' in camera) {
      camera.fov = 42;
      camera.near = 0.1;
      camera.far = 40;
    }
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Label3D({ position, children, color = '#80deea' }) {
  return (
    <Html position={position} center distanceFactor={7} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div
        style={{
          color,
          fontSize: '9px',
          fontWeight: 800,
          letterSpacing: '0.14em',
          textShadow: '0 0 10px rgba(0,0,0,0.95)',
          whiteSpace: 'nowrap',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {children}
      </div>
    </Html>
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
    tmat: drivers.tmatSpeed ?? 0.2,
    uplink: drivers.uplinkSpeed ?? 0.24,
  };
  const opacityMap = {
    rain: 0.4 + (drivers.rainIntensity ?? 0.1) * 0.6,
    soil: 0.4 + (drivers.soilIntensity ?? 0.1) * 0.6,
    tmat: 0.4 + (drivers.tmatIntensity ?? 0.1) * 0.6,
    uplink: 0.55 + (drivers.batteryPct != null ? (drivers.batteryPct / 100) * 0.35 : 0.2),
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

function GroundwaterReference({ y, color = '#ffa726' }) {
  if (y == null) return null;
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[TANK_RADIUS * 0.55, TANK_RADIUS * 1.05, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
    </mesh>
  );
}

function Pp57ReferenceLine({ y }) {
  if (y == null) return null;
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[TANK_RADIUS * 1.08, TANK_RADIUS * 1.18, 40]} />
      <meshBasicMaterial color="#ef5350" transparent opacity={0.45} toneMapped={false} />
    </mesh>
  );
}

/** Cross-section faces the fixed camera (+Z). */
const CUTAWAY_FACE_Z = 0.48;
const CUTAWAY_WALL_X = -0.42;

function AnimatedWaterVolume({ waterYRef, width, depth, bottomY, waterColors, emissiveIntensity = 1.1 }) {
  const fillRef = useRef(null);
  const colors = waterColors || { water: '#0288d1', emissive: '#00bcd4' };

  useFrame(({ clock }) => {
    if (!fillRef.current) return;
    const surfaceY = waterYRef.current;
    const fillH = Math.max(0.06, surfaceY - bottomY);
    fillRef.current.scale.y = fillH;
    fillRef.current.position.y = bottomY + fillH / 2;
    const pulse = 0.78 + Math.sin(clock.getElapsedTime() * 2.6) * 0.08;
    fillRef.current.material.emissiveIntensity = emissiveIntensity * pulse;
  });

  return (
    <mesh ref={fillRef} position={[0, bottomY, 0]}>
      <boxGeometry args={[width, 1, depth]} />
      <meshStandardMaterial
        color={colors.water}
        emissive={colors.emissive}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={0.82}
        roughness={0.12}
        metalness={0.08}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function AnimatedWaterColumn({ waterYRef, radius, bottomY, waterColors }) {
  const fillRef = useRef(null);
  const colors = waterColors || { water: '#29b6f6', emissive: '#00bcd4' };

  useFrame(({ clock }) => {
    if (!fillRef.current) return;
    const surfaceY = waterYRef.current;
    const fillH = Math.max(0.06, surfaceY - bottomY);
    fillRef.current.scale.y = fillH;
    fillRef.current.position.y = bottomY + fillH / 2;
    const pulse = 0.95 + Math.sin(clock.getElapsedTime() * 3.2) * 0.12;
    fillRef.current.material.emissiveIntensity = pulse * 1.35;
  });

  return (
    <mesh ref={fillRef} position={[0, bottomY, 0]}>
      <cylinderGeometry args={[radius, radius, 1, 32]} />
      <meshStandardMaterial
        color={colors.water}
        emissive={colors.emissive}
        emissiveIntensity={1.35}
        transparent
        opacity={0.92}
        roughness={0.08}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function WaterTableBubbles({ waterYRef, active }) {
  const refs = useRef([]);
  const seeds = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      x: Math.sin(i * 1.9) * CUTAWAY_RADIUS * 0.55,
      z: Math.cos(i * 2.3) * CUTAWAY_RADIUS * 0.45,
      phase: i * 0.47,
      speed: 0.35 + (i % 4) * 0.12,
    })),
    []
  );

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();
    const surfaceY = waterYRef.current;
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = seeds[i];
      const travel = ((t * s.speed + s.phase) % 1);
      mesh.position.set(s.x, surfaceY - 0.08 - travel * 0.55, s.z);
      mesh.scale.setScalar(0.6 + (1 - travel) * 0.9);
      mesh.material.opacity = (1 - travel) * 0.55;
    });
  });

  if (!active) return null;

  return (
    <group>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={[s.x, waterYRef.current, s.z]}
        >
          <sphereGeometry args={[0.014, 6, 6]} />
          <meshBasicMaterial color="#80deea" transparent opacity={0.4} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function CutawayWaterSurface({ waterYRef, waterColors, wide = false }) {
  const ref = useRef(null);
  const innerRef = useRef(null);
  const rippleRefs = useRef([]);

  useFrame(({ clock }) => {
    const y = waterYRef.current;
    const t = clock.getElapsedTime();
    if (ref.current) {
      ref.current.position.y = y;
      ref.current.rotation.z = Math.sin(t * 2.2) * 0.06;
    }
    if (innerRef.current) {
      innerRef.current.position.y = y + 0.006;
      const pulse = 1 + Math.sin(t * 4.1) * 0.04;
      innerRef.current.scale.set(pulse, pulse, 1);
    }
    rippleRefs.current.forEach((ring, i) => {
      if (!ring) return;
      ring.position.y = y + 0.01;
      const phase = (t * 0.7 + i * 0.33) % 1;
      ring.scale.set(0.4 + phase * 0.9, 0.4 + phase * 0.9, 1);
      ring.material.opacity = (1 - phase) * 0.45;
    });
  });

  const innerR = wide ? CUTAWAY_RADIUS * 0.58 : TANK_RADIUS * 0.52;
  const outerR = wide ? CUTAWAY_RADIUS * 0.96 : TANK_RADIUS * 0.94;

  return (
    <group>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 56]} />
        <meshStandardMaterial
          color={waterColors?.water ?? '#29b6f6'}
          emissive={waterColors?.emissive ?? '#00bcd4'}
          emissiveIntensity={1.8}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[innerR * 0.72, 32]} />
        <meshBasicMaterial
          color={waterColors?.emissive ?? '#00e5ff'}
          transparent
          opacity={0.35}
          toneMapped={false}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => { rippleRefs.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[innerR * 0.5, innerR * 0.85, 32]} />
          <meshBasicMaterial
            color={waterColors?.emissive ?? '#00e5ff'}
            transparent
            opacity={0.3}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function WaterTableLabels({ waterYRef, tmatElevationM }) {
  const waterLabelRef = useRef(null);
  const depthLabelRef = useRef(null);
  const depthText = tmatElevationM != null
    ? `→ ${Math.abs(tmatElevationM).toFixed(2)} m DEPTH`
    : '→ — m DEPTH';

  useFrame(() => {
    const y = waterYRef.current;
    if (waterLabelRef.current) waterLabelRef.current.position.set(0.72, y + 0.14, 0.28);
    if (depthLabelRef.current) depthLabelRef.current.position.set(0.72, y - 0.05, 0.28);
  });

  return (
    <group>
      <group ref={waterLabelRef}>
        <Label3D position={[0, 0, 0]} color="#80deea">
          WATER TABLE
        </Label3D>
      </group>
      <group ref={depthLabelRef}>
        <Label3D position={[0, 0, 0]} color="#4dd0e1">
          {depthText}
        </Label3D>
      </group>
    </group>
  );
}

function UndergroundCutaway({ waterYRef, waterColors, tmatElevationM, pp57LineY }) {
  const wallWidth = CUTAWAY_RADIUS * 2.15;
  const wallDepth = 0.62;

  return (
    <group position={[CUTAWAY_WALL_X, 0, CUTAWAY_FACE_Z]}>
      {/* Pit back + side walls */}
      <mesh position={[wallWidth * 0.22, (GROUND_Y + CUTAWAY_BOTTOM) / 2, -wallDepth * 0.42]} receiveShadow>
        <boxGeometry args={[wallWidth, CUTAWAY_DEPTH, 0.14]} />
        <meshStandardMaterial color="#3e2723" roughness={0.92} />
      </mesh>
      <mesh position={[-0.08, (GROUND_Y + CUTAWAY_BOTTOM) / 2, -wallDepth * 0.18]} receiveShadow>
        <boxGeometry args={[0.14, CUTAWAY_DEPTH, wallDepth * 0.85]} />
        <meshStandardMaterial color="#4e342e" roughness={0.9} />
      </mesh>
      <mesh position={[wallWidth * 0.22, CUTAWAY_BOTTOM + 0.02, -wallDepth * 0.18]} receiveShadow>
        <boxGeometry args={[wallWidth, 0.1, wallDepth * 0.85]} />
        <meshStandardMaterial color="#5d4037" roughness={0.88} />
      </mesh>

      {/* Soil strata — front face toward camera */}
      {SOIL_LAYERS.map((layer) => {
        const h = layer.top - layer.bottom;
        const midY = (layer.top + layer.bottom) / 2;
        return (
          <group key={layer.id}>
            <mesh position={[wallWidth * 0.22, midY, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[wallWidth, h, 0.18]} />
              <meshStandardMaterial
                color={layer.color}
                roughness={0.82}
                emissive={layer.emissive}
                emissiveIntensity={0.28}
                metalness={0.05}
              />
            </mesh>
            <mesh position={[wallWidth * 0.22, layer.bottom, 0.12]}>
              <boxGeometry args={[wallWidth * 1.02, 0.012, 0.02]} />
              <meshBasicMaterial color="#bcaaa4" toneMapped={false} />
            </mesh>
            <Label3D position={[-0.06, midY, 0.18]} color="#d7ccc8">
              {layer.label}
            </Label3D>
          </group>
        );
      })}

      <AnimatedWaterVolume
        waterYRef={waterYRef}
        width={wallWidth * 0.96}
        depth={wallDepth * 0.72}
        bottomY={CUTAWAY_BOTTOM + 0.04}
        waterColors={waterColors}
        emissiveIntensity={1.25}
      />

      <CutawayWaterSurface waterYRef={waterYRef} waterColors={waterColors} wide />
      <WaterTableBubbles waterYRef={waterYRef} active={tmatElevationM != null} />
      <WaterTableLabels waterYRef={waterYRef} tmatElevationM={tmatElevationM} />

      {pp57LineY != null && pp57LineY >= CUTAWAY_BOTTOM && (
        <group>
          <mesh position={[wallWidth * 0.22, pp57LineY, 0.14]}>
            <boxGeometry args={[wallWidth * 1.04, 0.018, 0.04]} />
            <meshBasicMaterial color="#ef5350" transparent opacity={0.9} toneMapped={false} />
          </mesh>
          <Label3D position={[-0.04, pp57LineY, 0.22]} color="#ef5350">
            PP57 −0.40 m
          </Label3D>
        </group>
      )}

      <mesh position={[wallWidth * 0.22, GROUND_Y + 0.008, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[wallWidth * 1.05, wallDepth * 0.95]} />
        <meshStandardMaterial color="#6d4c41" roughness={0.85} emissive="#2e7d32" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function SubmersibleSensor({ waterYRef, tankBottom }) {
  const bodyRef = useRef(null);
  const tipRef = useRef(null);
  const cableRef = useRef(null);
  const cableTop = GROUND_Y + 0.04;

  useFrame(() => {
    const waterTopY = waterYRef.current;
    const sensorY = tankBottom + Math.max(0.12, (waterTopY - tankBottom) * 0.55);
    if (bodyRef.current) bodyRef.current.position.y = sensorY;
    if (tipRef.current) tipRef.current.position.y = sensorY - 0.1;
    if (cableRef.current) {
      const cableH = Math.max(0.08, cableTop - sensorY);
      cableRef.current.scale.y = cableH;
      cableRef.current.position.y = (cableTop + sensorY) / 2;
    }
  });

  return (
    <group>
      <mesh ref={cableRef} position={[0, cableTop / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 1, 6]} />
        <meshStandardMaterial color="#455a64" metalness={0.75} roughness={0.25} />
      </mesh>
      <mesh ref={bodyRef} position={[0, tankBottom + 0.2, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.16, 12]} />
        <meshStandardMaterial color="#263238" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh ref={tipRef} position={[0, tankBottom + 0.1, 0]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00bcd4"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      <Label3D position={[0.14, tankBottom + 0.28, 0]} color="#80deea">
        SUBMERSIBLE
      </Label3D>
    </group>
  );
}

function TmatTank({ wellWater, levelPct, waterColors, waterYRef }) {
  const colors = waterColors || { water: '#29b6f6', emissive: '#00bcd4', glass: '#81d4fa' };
  const tankBottom = wellWater?.tankBottom ?? (TANK_CENTER_Y - TANK_HEIGHT / 2);
  const groundwaterY = wellWater?.groundwaterY;
  const visibleAboveGround = TANK_HEIGHT - TANK_BURIED_DEPTH;

  const showGwRef = groundwaterY != null
    && wellWater?.groundwaterElevationM != null
    && wellWater?.tmatElevationM != null
    && Math.abs(wellWater.groundwaterElevationM - wellWater.tmatElevationM) > 0.04;

  return (
    <group>
      <Label3D position={[0, visibleAboveGround + 0.22, 0]} color="#00e5ff">
        RKL-01 TMAT WELL
      </Label3D>

      {/* buried casing — glass section below + above ground */}
      <mesh position={[0, TANK_CENTER_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS, TANK_RADIUS, TANK_HEIGHT, 32, 1, true]} />
        <meshPhysicalMaterial
          color={colors.glass}
          transparent
          opacity={0.32}
          roughness={0.08}
          metalness={0.12}
          side={THREE.DoubleSide}
          transmission={0.18}
          emissive={colors.emissive}
          emissiveIntensity={0.12}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, TANK_CENTER_Y, 0]}>
        <cylinderGeometry args={[TANK_RADIUS * 1.03, TANK_RADIUS * 1.03, TANK_HEIGHT, 32, 1, true]} />
        <meshBasicMaterial color="#4dd0e1" wireframe transparent opacity={0.22} depthWrite={false} />
      </mesh>

      {/* groundwater column — unit height scaled to live TMAT level */}
      <AnimatedWaterColumn
        waterYRef={waterYRef}
        radius={TANK_RADIUS * 0.86}
        bottomY={tankBottom + 0.02}
        waterColors={colors}
      />
      <CutawayWaterSurface waterYRef={waterYRef} waterColors={colors} />
      <Pp57ReferenceLine y={wellWater?.pp57LineY} />
      {showGwRef && <GroundwaterReference y={groundwaterY} />}

      {/* ground surface cut plane hint */}
      <mesh position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TANK_RADIUS * 0.95, TANK_RADIUS * 1.25, 40]} />
        <meshBasicMaterial color="#8d6e63" transparent opacity={0.35} toneMapped={false} />
      </mesh>

      {/* wellhead collar at ground surface */}
      <mesh position={[0, GROUND_Y + 0.025, 0]} receiveShadow>
        <cylinderGeometry args={[TANK_RADIUS + 0.1, TANK_RADIUS + 0.14, 0.05, 32]} />
        <meshStandardMaterial color="#546e7a" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* peat ring around well opening */}
      <mesh position={[0, GROUND_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TANK_RADIUS + 0.08, TANK_RADIUS + 0.38, 32]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} emissive="#1b5e20" emissiveIntensity={0.15} />
      </mesh>

      <SubmersibleSensor waterYRef={waterYRef} tankBottom={tankBottom} />
    </group>
  );
}

function TmatWellAssembly({ wellWater, levelPct, waterColors }) {
  const tankBottom = wellWater?.tankBottom ?? (TANK_CENTER_Y - TANK_HEIGHT / 2);
  const tankTop = wellWater?.tankTop ?? (tankBottom + TANK_HEIGHT);
  const fallbackFill = wellWater?.fillPct != null
    ? Math.max(0.05, Math.min(1, wellWater.fillPct / 100))
    : (levelPct != null ? Math.max(0.05, Math.min(1, levelPct / 100)) : 0.05);
  const tankTargetY = wellWater?.waterSurfaceY ?? (tankBottom + TANK_HEIGHT * fallbackFill);
  const sceneTargetY = wellWater?.sceneWaterY ?? sceneWaterYFromElevation(wellWater?.tmatElevationM) ?? tankTargetY;
  const tankWaterTarget = Math.max(tankBottom + 0.04, Math.min(tankTop, sceneTargetY));

  const sceneWaterYRef = useAnimatedScalar(sceneTargetY, tankBottom + 0.05);
  const tankWaterYRef = useAnimatedScalar(tankWaterTarget, tankBottom + 0.05);

  return (
    <group position={TANK_POS}>
      <TmatTank
        wellWater={wellWater}
        levelPct={levelPct}
        waterColors={waterColors}
        waterYRef={tankWaterYRef}
      />
      <UndergroundCutaway
        waterYRef={sceneWaterYRef}
        waterColors={waterColors}
        tmatElevationM={wellWater?.tmatElevationM}
        pp57LineY={wellWater?.pp57LineY}
      />
    </group>
  );
}

function SoilHeatParticles({ active, intensity = 0.5 }) {
  const refs = useRef([]);
  const seeds = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      x: -0.05 + (i % 3) * 0.08,
      z: -0.02 + (i % 2) * 0.06,
      phase: i * 0.7,
    })),
    []
  );

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = seeds[i];
      mesh.position.set(s.x, 0.28 + ((t * 0.45 + s.phase) % 0.35), s.z);
      mesh.scale.setScalar(0.7 + intensity * 0.8);
    });
  });

  if (!active) return null;

  return (
    <group position={[0, 0, 0]}>
      {seeds.map((s, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[s.x, 0.28, s.z]}>
          <sphereGeometry args={[0.012, 6, 6]} />
          <meshBasicMaterial color="#ff7043" transparent opacity={0.65} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function PeatGround({ soilIntensity = 0.5, soilTemp = null, soilTempNorm = 0.35 }) {
  const blockRef = useRef(null);
  const probeLedRef = useRef(null);
  const moist = Math.max(0, Math.min(1, soilIntensity ?? 0.3));
  const temp = soilTemp ?? 26;
  const tempNorm = Math.max(0, Math.min(1, soilTempNorm ?? 0.35));
  const dry = moist < 0.35;
  const hot = temp >= 31;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (blockRef.current) {
      const pulse = 1 + Math.sin(t * (1.2 + moist * 2.5)) * 0.012 * moist;
      blockRef.current.scale.set(pulse, 1, pulse);
      const mat = blockRef.current.material;
      mat.emissiveIntensity = 0.12 + moist * 0.55 + (hot ? Math.sin(t * 3) * 0.08 : 0);
      if (hot) mat.emissive.set('#bf360c');
      else mat.emissive.set(moist > 0.5 ? '#1b5e20' : '#3e2723');
      if (dry) mat.color.set('#5d4037');
      else if (moist > 0.55) mat.color.set('#2e7d32');
      else mat.color.set('#6d4c41');
    }
    if (probeLedRef.current) {
      const ledColor = hot ? '#ff7043' : moist < 0.35 ? '#ffeb3b' : '#8bc34a';
      probeLedRef.current.material.color.set(ledColor);
      probeLedRef.current.material.emissive.set(ledColor);
      probeLedRef.current.material.emissiveIntensity = 1 + Math.sin(t * 4) * 0.35;
    }
  });

  return (
    <group position={[-1.15, 0, -0.15]}>
      <Label3D position={[0, 0.72, 0]} color={hot ? '#ff7043' : '#8bc34a'}>
        SOIL PROBE
      </Label3D>
      <mesh ref={blockRef} position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[0.75, 0.24, 0.55]} />
        <meshStandardMaterial
          color="#6d4c41"
          roughness={0.82}
          emissive="#2e7d32"
          emissiveIntensity={0.2 + moist * 0.35}
        />
      </mesh>
      {/* moisture strata layers */}
      {[0.06, 0.12, 0.18].map((y, i) => (
        <mesh key={y} position={[0, y, 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.62, 0.42]} />
          <meshBasicMaterial
            color={moist > (i + 1) * 0.25 ? '#43a047' : '#795548'}
            transparent
            opacity={0.18 + moist * 0.22}
            toneMapped={false}
          />
        </mesh>
      ))}
      <SoilHeatParticles active={hot} intensity={tempNorm} />
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
      <mesh ref={probeLedRef} position={[0.12, 0.66, 0.12]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#8bc34a" emissive="#8bc34a" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RainGauge() {
  return (
    <group position={[0.55, 0, -0.35]}>
      <Label3D position={[0, 1.55, 0]} color="#ffeb3b">
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
      <Label3D position={[0, 0.95, 0]} color="#ff9800">
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

function HmiLoggerPanel({ uplinkActive }) {
  const ledRef = useRef(null);
  useFrame(({ clock }) => {
    if (!ledRef.current) return;
    const blink = uplinkActive ? 0.6 + Math.sin(clock.getElapsedTime() * 4) * 0.4 : 0.15;
    ledRef.current.material.emissiveIntensity = blink * 2.5;
  });

  return (
    <group position={[1.35, 0, 0.15]} rotation={[0, -0.45, 0]}>
      <Label3D position={[0, 1.05, 0]} color="#b0bec5">
        HMI LOGGER
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
      <Label3D position={[0, 1.45, 0]} color="#e0e0e0">
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

function SceneContent({ levelPct, wellWater, flowDrivers, waterColors, uplinkActive }) {
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
      <PeatGround
        soilIntensity={drivers.soilIntensity}
        soilTemp={drivers.soilTemp}
        soilTempNorm={drivers.soilTempNorm}
      />
      <RainGauge />
      <SolarArray batteryPct={batteryPct} />
      <HmiLoggerPanel uplinkActive={uplinkActive} />
      <StarlinkDish uplinkActive={uplinkActive} />
      <TmatWellAssembly levelPct={levelPct} wellWater={wellWater} waterColors={waterColors} />
      <RainParticles active={drivers.showRain} intensity={drivers.rainIntensity} />
      <FlowPaths flowDrivers={flowDrivers} />
    </>
  );
}

export default function TmatScene3D({ levelPct, wellWater, flowDrivers, waterColors, uplinkActive = true }) {
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
        wellWater={wellWater}
        flowDrivers={flowDrivers}
        waterColors={waterColors}
        uplinkActive={uplinkActive}
      />
    </Canvas>
  );
}
