"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

type ExtractionParams = {
  yThreshold: number;
  corners: number[][];
};

type ThreeSceneProps = {
  onCoordChange: (coords: THREE.Vector3 | null) => void;
  modelUrl: string | null;
  extractionParams: ExtractionParams | null;
  onExtractionResults: (results: string[]) => void;
};

export default function ThreeScene({ onCoordChange, modelUrl, extractionParams, onExtractionResults }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(50, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    camera.position.set(-5.58, 44.30, 74.58);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    currentMount.appendChild(renderer.domElement);

    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath('https://unpkg.com/three@0.155.0/examples/jsm/libs/basis/')
      .detectSupport(renderer);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(-4.8, -3.1, 2.2);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(15, 20, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const setupModel = (model: THREE.Object3D) => {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.position.set(-3.0086, 1.8078, 0.0286);
      if (modelRef.current) scene.remove(modelRef.current);
      scene.add(model);
      modelRef.current = model;
      onCoordChange(null);
    };

    const createFallback = () => {
      const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(10, 3, 128, 16), new THREE.MeshStandardMaterial({ color: 0x7c3aed }));
      setupModel(mesh);
    };

    if (modelUrl) {
      new GLTFLoader().setKTX2Loader(ktx2Loader).load(modelUrl, (gltf) => setupModel(gltf.scene), undefined, createFallback);
    } else {
      createFallback();
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let marker: THREE.Mesh | null = null;

    const onClick = (event: MouseEvent) => {
      const clickedOnUi = (event.target as HTMLElement).closest(`header, [data-sidebar="sidebar"], .floating-action-button, [id$="-panel"]`);
      if (!modelRef.current || clickedOnUi) return;

      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(modelRef.current, true);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        onCoordChange(point.clone());
        if (!marker) {
          marker = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }));
          scene.add(marker);
        }
        marker.position.copy(point);
      }
    };

    currentMount.addEventListener('click', onClick);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      currentMount.removeEventListener('click', onClick);
      renderer.dispose();
      ktx2Loader.dispose();
    };
  }, [modelUrl, onCoordChange]);

  useEffect(() => {
    if (!extractionParams || !modelRef.current) return;

    const { yThreshold, corners } = extractionParams;
    const results: string[] = [];

    const isInside = (x: number, z: number, poly: number[][]) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], zi = poly[i][2];
        const xj = poly[j][0], zj = poly[j][2];
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    modelRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const worldPos = new THREE.Vector3();
        object.getWorldPosition(worldPos);

        if (worldPos.y > yThreshold) {
          if (corners.length === 0 || isInside(worldPos.x, worldPos.z, corners)) {
            results.push(object.name || `Unnamed Mesh (${object.uuid.slice(0, 5)})`);
          }
        }
      }
    });

    onExtractionResults(Array.from(new Set(results)));
  }, [extractionParams, onExtractionResults]);

  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
