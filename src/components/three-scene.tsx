
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

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
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // Initialize Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111111);

    // Initialize Camera
    const camera = new THREE.PerspectiveCamera(50, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
    camera.position.set(0, 50, 100);
    cameraRef.current = camera;

    // Initialize Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Handle Resize (Responsive to sidebar changes)
    const resizeObserver = new ResizeObserver(() => {
      if (!currentMount || !cameraRef.current || !rendererRef.current) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    });
    resizeObserver.observe(currentMount);

    // Setup Loaders
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/basis/')
      .detectSupport(renderer);

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setKTX2Loader(ktx2Loader);

    // Setup Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Setup Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const setupModel = (model: THREE.Object3D) => {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // PRECISE RECALIBRATION based on Point 1 and Point 2 reference
      // Calculations: Delta X: +7.7853, Delta Y: -0.5126, Delta Z: +9.2478
      // Applied to previous calibration (1.2873, -1.367, -9.401)
      model.position.set(9.0726, -1.8796, -0.1532);
      
      if (modelRef.current) scene.remove(modelRef.current);
      scene.add(model);
      modelRef.current = model;
      onCoordChange(null);
      
      // Move camera to look at the new model position
      camera.lookAt(model.position);
      controls.target.copy(model.position);
    };

    const createFallback = () => {
      const geometry = new THREE.TorusKnotGeometry(10, 3, 128, 16);
      const material = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.3, metalness: 0.8 });
      const mesh = new THREE.Mesh(geometry, material);
      setupModel(mesh);
    };

    // Load Model
    if (modelUrl) {
      gltfLoader.load(
        modelUrl, 
        (gltf) => {
          setupModel(gltf.scene);
        }, 
        undefined,
        (error) => {
          console.error("Error loading model:", error);
          createFallback();
        }
      );
    } else {
      createFallback();
    }

    // Interaction logic
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
          // Reduced marker size to 0.05 for extreme precision
          marker = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }));
          scene.add(marker);
        }
        marker.position.copy(point);
      }
    };

    currentMount.addEventListener('click', onClick);

    // Animation Loop
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      currentMount.removeEventListener('click', onClick);
      resizeObserver.disconnect();
      renderer.dispose();
      dracoLoader.dispose();
      ktx2Loader.dispose();
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl, onCoordChange]);

  // Spatial Extraction Effect
  useEffect(() => {
    if (!extractionParams || !modelRef.current) return;

    const { yThreshold, corners } = extractionParams;
    const results: string[] = [];

    // Point-in-Polygon logic for XZ plane
    const isInside = (x: number, z: number, poly: number[][]) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0];
        const zi = poly[i].length === 3 ? poly[i][2] : poly[i][1];
        const xj = poly[j][0];
        const zj = poly[j].length === 3 ? poly[j][2] : poly[j][1];
        
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    modelRef.current.updateMatrixWorld(true);

    modelRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(object);
        
        if (box.isEmpty()) return;

        const center = new THREE.Vector3();
        box.getCenter(center);

        // Precision check: Mesh base (min.y) must be at or above threshold
        if (box.min.y >= yThreshold) {
          if (corners.length === 0 || isInside(center.x, center.z, corners)) {
            results.push(object.name || `Unnamed Mesh (${object.uuid.slice(0, 5)})`);
          }
        }
      }
    });

    onExtractionResults(Array.from(new Set(results)));
  }, [extractionParams, onExtractionResults]);

  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
