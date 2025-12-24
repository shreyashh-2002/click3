
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';


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
      2000 // Increased far plane
    );
    camera.position.set(-5.58, 44.30, 74.58);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    currentMount.appendChild(renderer.domElement);

    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath( 'https://unpkg.com/three@0.155.0/examples/jsm/libs/basis/' )
      .detectSupport( renderer );


    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(-4.8, -3.1, 2.2);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(15, 20, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    let currentModel: THREE.Object3D | null = null;
    let intersectionMarker: THREE.Mesh | null = null;

    const setupModel = (model: THREE.Object3D) => {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        
        model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        model.position.sub(center); 
        model.position.y -= box.min.y;

        if (currentModel) {
            scene.remove(currentModel);
        }
        scene.add(model);
        currentModel = model;
        onCoordChange(null);

        if(intersectionMarker) {
            scene.remove(intersectionMarker);
            intersectionMarker = null;
        }
    };


    const createFallbackModel = () => {
      const geometry = new THREE.TorusKnotGeometry(10, 3, 128, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0x7c3aed, 
        roughness: 0.1,
        metalness: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      setupModel(mesh);
    };

    if (modelUrl) {
        const loader = new GLTFLoader().setKTX2Loader(ktx2Loader);
        loader.load(modelUrl, (gltf) => {
            setupModel(gltf.scene);
        }, undefined, (error) => {
            console.error('An error happened while loading the model:', error);
            createFallbackModel();
        });
    } else {
      createFallbackModel();
    }


    // Raycaster for click detection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
        // This querySelector checks if the click originated inside any of the UI panels.
        const clickedOnUi = (event.target as HTMLElement).closest(
            `#${CSS.escape('code-generator-panel')}, #${CSS.escape('calibration-panel')}, #${CSS.escape('coords-panel')}, header`
        );
        
        if (!currentModel || clickedOnUi) {
            return;
        }

        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(currentModel, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            onCoordChange(point.clone());

            // Visual feedback
            if (!intersectionMarker) {
                const markerGeometry = new THREE.SphereGeometry(0.2, 32, 32); 
                const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.8 });
                intersectionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
                scene.add(intersectionMarker);
            }
            intersectionMarker.position.copy(point);
            intersectionMarker.visible = true;
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
        scene.remove(intersectionMarker);
        intersectionMarker.geometry.dispose();
        if (Array.isArray(intersectionMarker.material)) {
            intersectionMarker.material.forEach(m => m.dispose());
        } else {
            intersectionMarker.material.dispose();
        }
      }
      controls.dispose();
      renderer.dispose();
      ktx2Loader.dispose();
    };
  }, [onCoordChange, modelUrl]);

  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}

    