"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type ThreeSceneProps = {
  onCoordChange: (coords: THREE.Vector3 | null) => void;
  modelUrl: string | null;
};

export default function ThreeScene({ onCoordChange, modelUrl }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 4;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 20;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    let currentModel: THREE.Object3D | null = null;
    let fallbackModel: THREE.Mesh | null = null;

    const createFallbackModel = () => {
      const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0x3f51b5,
        roughness: 0.4,
        metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      currentModel = mesh;
      fallbackModel = mesh;
      setModel(mesh);
    };

    if (modelUrl) {
        const loader = new GLTFLoader();
        loader.load(modelUrl, (gltf) => {
            if (currentModel) {
                scene.remove(currentModel);
            }
            const loadedModel = gltf.scene;
            
            // Center and scale model
            const box = new THREE.Box3().setFromObject(loadedModel);
            const center = box.getCenter(new THREE.Vector3());
            loadedModel.position.sub(center);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim;
            loadedModel.scale.set(scale, scale, scale);

            scene.add(loadedModel);
            currentModel = loadedModel;
            setModel(loadedModel);
            onCoordChange(null);
        }, undefined, (error) => {
            console.error('An error happened while loading the model:', error);
            if (!fallbackModel) createFallbackModel();
        });
    } else {
      if (!fallbackModel) createFallbackModel();
    }


    // Raycaster for click detection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let intersectionMarker: THREE.Mesh | null = null;

    const onClick = (event: MouseEvent) => {
        if (!currentModel) return;

        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(currentModel, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            onCoordChange(point);

            // Visual feedback
            if (intersectionMarker) {
            scene.remove(intersectionMarker);
            }
            const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x7e57c2 }); // Accent color
            intersectionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            intersectionMarker.position.copy(point);
            scene.add(intersectionMarker);
        } else {
            onCoordChange(null);
            if (intersectionMarker) {
            scene.remove(intersectionMarker);
            intersectionMarker = null;
            }
        }
    };

    currentMount.addEventListener('click', onClick);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (currentModel === fallbackModel) { // only rotate the default model
        currentModel.rotation.x += 0.001;
        currentModel.rotation.y += 0.002;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!currentMount) return;
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      currentMount.removeEventListener('click', onClick);
      window.removeEventListener('resize', handleResize);
      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }
      
      if(currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if(Array.isArray(object.material)){
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
      }

      if (intersectionMarker) {
        intersectionMarker.geometry.dispose();
        if (Array.isArray(intersectionMarker.material)) {
            intersectionMarker.material.forEach(m => m.dispose());
        } else {
            intersectionMarker.material.dispose();
        }
      }
      controls.dispose();
      renderer.dispose();
    };
  }, [onCoordChange, modelUrl]);

  return <div ref={mountRef} className="w-full h-full" />;
}
