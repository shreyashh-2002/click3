
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type ThreeSceneProps = {
  onCoordChange: (coords: THREE.Vector3 | null) => void;
  modelUrl: string | null;
};

export default function ThreeScene({ onCoordChange, modelUrl }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(4, 4, 4);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(5, 10, 7.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-5, -5, -7.5);
    scene.add(fillLight);

    // Grid and ground plane
    const grid = new THREE.GridHelper(50, 50, 0x444444, 0x444444);
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let currentModel: THREE.Object3D | null = null;
    let fallbackModel: THREE.Mesh | null = null;
    let intersectionMarker: THREE.Mesh | null = null;

    const setupModel = (model: THREE.Object3D) => {
        model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Center, scale, and align model to ground
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale model to a consistent size
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        model.scale.set(scale, scale, scale);

        // Recalculate bounding box after scaling
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

        // Center the model and place its bottom on the ground plane (y=0)
        model.position.x += (scaledBox.min.x - scaledCenter.x);
        model.position.y -= scaledBox.min.y;
        model.position.z += (scaledBox.min.z - scaledCenter.z);

        if (currentModel) {
            scene.remove(currentModel);
        }
        scene.add(model);
        currentModel = model;
        onCoordChange(null);
        controls.autoRotate = false;
        if(intersectionMarker) {
            scene.remove(intersectionMarker);
            intersectionMarker = null;
        }
    };


    const createFallbackModel = () => {
      const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0x7c3aed, // primary color
        roughness: 0.1,
        metalness: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      fallbackModel = mesh;
      setupModel(mesh);
    };

    if (modelUrl) {
        const loader = new GLTFLoader();
        loader.load(modelUrl, (gltf) => {
            setupModel(gltf.scene);
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

    const onClick = (event: MouseEvent) => {
        if (!currentModel || mountRef.current?.querySelector(':hover')?.closest('aside, header, [role="dialog"], [role="alert"], #coords-panel')) {
            return;
        }

        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(currentModel, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            onCoordChange(point);
            controls.autoRotate = false;

            // Visual feedback
            if (intersectionMarker) {
              scene.remove(intersectionMarker);
            }
            const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xa78bfa }); // Accent color
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

  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
