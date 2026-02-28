
"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { MeshInfo } from './mesh-search-panel';


type ThreeSceneProps = {
  onCoordChange: (coords: THREE.Vector3 | null) => void;
  modelUrl: string | null;
  searchTerm: string;
  onSearchResults: (results: MeshInfo[]) => void;
  yFilter: { y: number; corners?: string; enabled: boolean } | null;
  onYFilterResults: (results: string[]) => void;
};

export default function ThreeScene({ onCoordChange, modelUrl, searchTerm, onSearchResults, yFilter, onYFilterResults }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111111);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      2000
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
        const clickedOnUi = (event.target as HTMLElement).closest(
            `#${CSS.escape('code-generator-panel')}, #${CSS.escape('corners-generator-panel')}, #${CSS.escape('mesh-search-panel')}, #${CSS.escape('mesh-filter-panel')}, header, [data-sidebar="sidebar"], .floating-action-button`
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

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(currentMount);

    return () => {
      cancelAnimationFrame(animationFrameId);
      currentMount.removeEventListener('click', onClick);
      resizeObserver.disconnect();
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
      sceneRef.current = null;
    };
  }, [onCoordChange, modelUrl]);
  
  useEffect(() => {
    if (!searchTerm || !sceneRef.current) {
        if (searchTerm === '') onSearchResults([]);
        return;
    };

    const scene = sceneRef.current;
    const results: MeshInfo[] = [];
    scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.name.toLowerCase().startsWith(searchTerm.toLowerCase())) {
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            results.push({
                name: object.name,
                center,
            });
        }
    });
    onSearchResults(results);
}, [searchTerm, onSearchResults]);

useEffect(() => {
    if (!yFilter || !yFilter.enabled || !sceneRef.current) {
        return;
    };

    const scene = sceneRef.current;
    const results: string[] = [];
    let filterBox: THREE.Box3 | null = null;

    if (yFilter.corners) {
        try {
            let jsonString = yFilter.corners.trim();
            // Extract the array part: find the first '[' and last ']'
            const startIndex = jsonString.indexOf('[');
            const endIndex = jsonString.lastIndexOf(']');

            if (startIndex !== -1 && endIndex > startIndex) {
                jsonString = jsonString.substring(startIndex, endIndex + 1);
                
                // Robust parsing: remove trailing commas before closing brackets
                const sanitized = jsonString
                    .replace(/,\s*([\]}])/g, '$1')
                    .replace(/'/g, '"');
                    
                const parsedCorners = JSON.parse(sanitized);
                
                if (Array.isArray(parsedCorners) && parsedCorners.length > 0) {
                    const points = parsedCorners.map(p => {
                        if (Array.isArray(p) && p.length >= 3) {
                            return new THREE.Vector3(p[0], p[1], p[2]);
                        }
                        return null;
                    }).filter((p): p is THREE.Vector3 => p !== null);

                    if (points.length > 0) {
                        filterBox = new THREE.Box3().setFromPoints(points);
                        // IMPORTANT: Make the box vertically infinite so it only filters by X and Z area
                        filterBox.min.y = -10000;
                        filterBox.max.y = 10000;
                    }
                }
            }
        } catch (e) {
            console.error("Generator 4: Could not parse corners. Error:", e);
        }
    }

    scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.name) {
            const meshBox = new THREE.Box3().setFromObject(object);
            
            if (meshBox.isEmpty()) return;

            // Check if the base of the mesh is above the threshold
            const yCondition = meshBox.min.y >= yFilter.y;
            
            let areaCondition = true;
            if (filterBox) {
                // Check if the mesh box intersects with our infinite vertical column
                areaCondition = filterBox.intersectsBox(meshBox);
            }

            if (yCondition && areaCondition) {
                results.push(object.name);
            }
        }
    });
    
    onYFilterResults(results);
}, [yFilter, onYFilterResults]);


  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
}
