import * as THREE from 'three';

export class BallRenderer {
  constructor(canvasId, onSpeedChange = () => {}) {
    this.onSpeedChange = onSpeedChange;
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas.parentElement;
    this.speedMultiplier = 1.2;
    this.baseSpeed = 0.015;
    this.boostMultiplier = 1.0;
    this.targetBoostMultiplier = 1.0;
    this.boostTimer = null;
    this.glowEnabled = true;
    
    this.init();
  }

  init() {
    const width = this.canvas.clientWidth || 140;
    const height = this.canvas.clientHeight || 140;
    const size = Math.round(Math.min(width, height)) || 140;

    // 1. Scene & Camera (Strictly 1:1 circular aspect ratio)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1.0, 0.1, 100);
    this.camera.position.z = 2.85;

    // 2. High-performance WebGL Renderer with Alpha
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(size, size, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // 3. Texture Loading with multi-path support
    const textureLoader = new THREE.TextureLoader();

    const loadTex = (relPath) => {
      const tex = textureLoader.load(
        'assets/' + relPath,
        () => {
          if (this.sphereMat) this.sphereMat.needsUpdate = true;
        },
        undefined,
        () => {
          textureLoader.load('public/assets/' + relPath, (fallbackTex) => {
            fallbackTex.colorSpace = THREE.SRGBColorSpace;
            fallbackTex.wrapS = THREE.RepeatWrapping;
            fallbackTex.wrapT = THREE.ClampToEdgeWrapping;
            if (this.sphereMat) {
              if (relPath.includes('emissive')) this.sphereMat.emissiveMap = fallbackTex;
              else if (relPath.includes('bump')) this.sphereMat.bumpMap = fallbackTex;
              else this.sphereMat.map = fallbackTex;
              this.sphereMat.needsUpdate = true;
            }
          });
        }
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    };

    const globeTexture = loadTex('globe_texture.png');
    const emissiveTexture = loadTex('globe_emissive.png');
    const bumpTexture = loadTex('globe_bump.png');

    // 4. Globe Sphere Mesh with Smooth Matte Material (No specular glare points)
    const sphereGeo = new THREE.SphereGeometry(1.0, 64, 64);
    
    this.sphereMat = new THREE.MeshStandardMaterial({
      map: globeTexture,
      emissiveMap: emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.45,
      roughness: 0.95,
      metalness: 0.0
    });

    this.sphere = new THREE.Mesh(sphereGeo, this.sphereMat);
    // Slight natural tilt to match hand angle
    this.sphere.rotation.z = -0.15;
    this.sphere.rotation.x = 0.08;
    this.scene.add(this.sphere);

    // 5. Balanced Lighting (No specular glare points, rich deep blue & glowing lightning)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Soft front-left fill for yellow lightning
    const leftKeyLight = new THREE.DirectionalLight(0xfffbeb, 0.9);
    leftKeyLight.position.set(-2.0, 1.5, 2.0);
    this.scene.add(leftKeyLight);

    // Soft front-right fill for green lightning
    const rightKeyLight = new THREE.DirectionalLight(0xf0fdf4, 0.8);
    rightKeyLight.position.set(2.0, 1.5, 2.0);
    this.scene.add(rightKeyLight);

    // Subtle bottom bounce fill
    const bottomFill = new THREE.DirectionalLight(0x38bdf8, 0.35);
    bottomFill.position.set(0, -2.0, 1.2);
    this.scene.add(bottomFill);

    // 6. Dual-color Particle Energy Rings (Yellow & Green lightning sparks)
    this.createParticleRings();

    // 7. Event listeners
    this.setupInteractions();

    // 8. Start Animation Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    // 9. Resize Observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
  }

  createParticleRings() {
    // Ring 1: Golden Yellow Sparks
    const count1 = 28;
    const geo1 = new THREE.BufferGeometry();
    const pos1 = new Float32Array(count1 * 3);
    for (let i = 0; i < count1; i++) {
      const angle = (i / count1) * Math.PI * 2;
      const r = 1.22 + Math.random() * 0.18;
      pos1[i * 3] = Math.cos(angle) * r;
      pos1[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      pos1[i * 3 + 2] = Math.sin(angle) * r;
    }
    geo1.setAttribute('position', new THREE.BufferAttribute(pos1, 3));
    const mat1 = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.055,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.particlesGold = new THREE.Points(geo1, mat1);
    this.particlesGold.rotation.z = -0.2;
    this.scene.add(this.particlesGold);

    // Ring 2: Emerald Green Sparks
    const count2 = 24;
    const geo2 = new THREE.BufferGeometry();
    const pos2 = new Float32Array(count2 * 3);
    for (let i = 0; i < count2; i++) {
      const angle = (i / count2) * Math.PI * 2;
      const r = 1.28 + Math.random() * 0.22;
      pos2[i * 3] = Math.cos(angle) * r;
      pos2[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      pos2[i * 3 + 2] = Math.sin(angle) * r;
    }
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    const mat2 = new THREE.PointsMaterial({
      color: 0x4ade80,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    this.particlesGreen = new THREE.Points(geo2, mat2);
    this.particlesGreen.rotation.x = 0.35;
    this.particlesGreen.rotation.z = 0.15;
    this.scene.add(this.particlesGreen);
  }

  setupInteractions() {
    this.canvas.addEventListener('click', (e) => {
      e.stopPropagation();
      this.boostSpin();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.2;
      this.setSpeedMultiplier(Number(Math.max(0.2, Math.min(5.0, this.speedMultiplier + delta)).toFixed(1)));
      this.onSpeedChange(this.speedMultiplier);
    }, { passive: false });
  }

  boostSpin() {
    if (this.targetBoostMultiplier <= 1.05) {
      this.targetBoostMultiplier = 2.0;
    } else {
      this.targetBoostMultiplier = Math.min(32.0, this.targetBoostMultiplier * 2.0);
    }
    this.boostMultiplier = this.targetBoostMultiplier;

    // Trigger visual aura burst scaled with multiplier
    const aura = document.getElementById('globe-aura');
    if (aura) {
      const level = Math.log2(this.targetBoostMultiplier);
      const scale = Math.min(1.8, 1.25 + level * 0.1);
      const bright = Math.min(2.5, 1.3 + level * 0.25);
      aura.style.filter = `blur(16px) brightness(${bright})`;
      aura.style.transform = `scale(${scale})`;
      setTimeout(() => {
        aura.style.filter = '';
        aura.style.transform = '';
      }, 700);
    }

    if (this.boostTimer) clearTimeout(this.boostTimer);
    this.boostTimer = setTimeout(() => {
      this.targetBoostMultiplier = 1.0;
    }, 2500);

    return this.targetBoostMultiplier;
  }

  setSpeedMultiplier(val) {
    this.speedMultiplier = parseFloat(val);
    const label = document.getElementById('label-ball-speed');
    if (label) label.textContent = `${this.speedMultiplier.toFixed(1)}x`;
    const input = document.getElementById('setting-ball-speed');
    if (input) input.value = this.speedMultiplier;
  }

  setGlowEnabled(enabled) {
    this.glowEnabled = enabled;
    if (this.particlesGold) this.particlesGold.visible = enabled;
    if (this.particlesGreen) this.particlesGreen.visible = enabled;
    const aura = document.getElementById('globe-aura');
    if (aura) aura.style.display = enabled ? 'block' : 'none';
  }

  onResize() {
    if (!this.container || !this.renderer) return;
    const rect = this.container.getBoundingClientRect();
    const size = Math.round(Math.min(rect.width, rect.height));
    if (size > 0) {
      this.renderer.setSize(size, size, false);
      this.camera.aspect = 1.0;
      this.camera.updateProjectionMatrix();
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    // Smooth inertia decay when returning to base speed
    if (this.boostMultiplier > this.targetBoostMultiplier) {
      this.boostMultiplier = Math.max(this.targetBoostMultiplier, this.boostMultiplier * 0.985 - 0.005);
    } else if (this.boostMultiplier < this.targetBoostMultiplier) {
      this.boostMultiplier += (this.targetBoostMultiplier - this.boostMultiplier) * 0.3;
    }

    // Target rotation speed calculation
    const targetSpeed = this.baseSpeed * this.speedMultiplier * this.boostMultiplier;
    this.sphere.rotation.y += targetSpeed;

    // Subtle pulsing emissive breathing + boost glow
    if (this.sphereMat) {
      const boostGlow = Math.min(0.8, (this.boostMultiplier - 1.0) * 0.1);
      const pulse = 0.35 + Math.sin(Date.now() * 0.003) * 0.1 + boostGlow;
      this.sphereMat.emissiveIntensity = pulse;
    }

    // Particle orbits
    if (this.particlesGold && this.particlesGold.visible) {
      this.particlesGold.rotation.y += targetSpeed * 0.9;
      this.particlesGold.rotation.x = Math.sin(Date.now() * 0.001) * 0.12;
    }
    if (this.particlesGreen && this.particlesGreen.visible) {
      this.particlesGreen.rotation.y -= targetSpeed * 0.7;
      this.particlesGreen.rotation.z = Math.cos(Date.now() * 0.0012) * 0.15;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
