/**
 * Model Topografi 3D Kabupaten Banjarnegara
 * Interactive WebGL Three.js Application with 3D Buildings, Trees, Roads & Relief
 */

(function () {
  'use strict';

  // State
  let scene, camera, renderer, controls;
  let topMesh, skirtMesh, bottomMesh;
  let topGeometry, skirtGeometry, bottomGeometry;
  let terrainData = null, featuresData = null;
  let buildingsData = null, treesData = null, waterData = null, forestClumpsData = null;
  let instancedBuildings = null, instancedTrees = null, instancedForestClumps = null;
  let roadMesh = null, riverMesh = null, waterBodiesMesh = null;
  let treeDisplayMode = 'auto'; // 'auto' | 'clumps' | 'indiv'
  let webScale = 1.0;
  let vertexCount = 0;
  let currentExaggeration = 1.8;
  let bldgScaleMultiplier = 1.5;
  let treeScaleMultiplier = 1.0;
  let currentMaterialKey = 'maps3d';
  let isAutoRotating = false;
  let isCameraAnimating = false;

  const materials = {};
  const vectorLayers = {
    buildings: { visible: true },
    trees: { visible: true },
    jalan: { group: new THREE.Group(), visible: true },
    kecamatan: { group: new THREE.Group(), visible: true },
    sungai: { group: new THREE.Group(), visible: true },
    landmarks: { group: new THREE.Group(), visible: true }
  };

  const landmarkElements = [];

  // DOM Elements
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const sliderExaggeration = document.getElementById('slider-exaggeration');
  const lblExaggeration = document.getElementById('lbl-exaggeration');
  const sliderBldgScale = document.getElementById('slider-bldg-scale');
  const lblBldgScale = document.getElementById('lbl-bldg-scale');
  const sliderTreeScale = document.getElementById('slider-tree-scale');
  const lblTreeScale = document.getElementById('lbl-tree-scale');

  const btnAutoRotate = document.getElementById('btn-autorotate');
  const txtAutoRotate = document.getElementById('txt-autorotate');
  const btnResetCam = document.getElementById('btn-reset-cam');
  const btnScreenshot = document.getElementById('btn-screenshot');
  const controlPanel = document.getElementById('control-panel');
  const btnClosePanel = document.getElementById('btn-close-panel');
  const btnOpenPanel = document.getElementById('btn-open-panel');
  const pinsContainer = document.getElementById('landmark-pins-container');

  // Layer Checkboxes
  const chkBuildings = document.getElementById('chk-buildings');
  const chkTrees = document.getElementById('chk-trees');
  const chkJalan = document.getElementById('chk-jalan');
  const chkKecamatan = document.getElementById('chk-kecamatan');
  const chkSungai = document.getElementById('chk-sungai');
  const chkLandmarks = document.getElementById('chk-landmarks');
  const chkWireframe = document.getElementById('chk-wireframe');

  // Stat labels
  const statMin = document.getElementById('stat-min');
  const statMax = document.getElementById('stat-max');
  const statRange = document.getElementById('stat-range');

  /* ------------------------------------------------------------------ */
  /* 1. Inisialisasi Three.js Scene                                     */
  /* ------------------------------------------------------------------ */

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0035);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 3000);
    camera.position.set(-8, 85, 120);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    container.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 1.0; // Izinkan zoom dekat hingga permukaan tanah / desa
    controls.maxDistance = 600;
    controls.target.set(-6, 0, 0);

    // Pencahayaan
    setupLighting();

    // Tambahkan grup layer ke scene
    scene.add(vectorLayers.jalan.group);
    scene.add(vectorLayers.kecamatan.group);
    scene.add(vectorLayers.sungai.group);
    scene.add(vectorLayers.landmarks.group);

    window.addEventListener('resize', onWindowResize);
  }

  function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.68);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.45);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 0.95);
    sunLight.position.set(-80, 120, -70);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 400;
    const d = 80;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rimLight.position.set(70, 40, 80);
    scene.add(rimLight);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Pemuatan Aset & Tekstur                                         */
  /* ------------------------------------------------------------------ */

  async function loadDataAndTextures() {
    try {
      loadingText.textContent = 'Mengunduh mesh terrain, bangunan, vegetasi & perairan Banjarnegara…';
      const [terrainRes, featuresRes, bldgRes, treeRes, waterRes, clumpsRes] = await Promise.all([
        fetch('data/banjarnegara_terrain.json?v=2.2'),
        fetch('data/banjarnegara_features.json?v=2.2'),
        fetch('data/banjarnegara_buildings.json?v=2.2').catch(() => null),
        fetch('data/banjarnegara_trees.json?v=2.2').catch(() => null),
        fetch('data/banjarnegara_water.json?v=2.2').catch(() => null),
        fetch('data/banjarnegara_forest_clumps.json?v=2.2').catch(() => null)
      ]);

      if (!terrainRes.ok) throw new Error('Gagal memuat banjarnegara_terrain.json');
      terrainData = await terrainRes.json();

      if (featuresRes && featuresRes.ok) {
        featuresData = await featuresRes.json();
      }
      if (bldgRes && bldgRes.ok) {
        buildingsData = await bldgRes.json();
      }
      if (treeRes && treeRes.ok) {
        treesData = await treeRes.json();
      }
      if (waterRes && waterRes.ok) {
        waterData = await waterRes.json();
      }
      if (clumpsRes && clumpsRes.ok) {
        forestClumpsData = await clumpsRes.json();
      }

      loadingText.textContent = 'Memuat tekstur topografi & satelit…';
      const texLoader = new THREE.TextureLoader();

      const loadTex = (url) => new Promise((resolve, reject) => {
        texLoader.load(url, resolve, undefined, reject);
      });

      const [texTopo, texSatelit, texPola] = await Promise.all([
        loadTex('data/texture_topo.png'),
        loadTex('data/texture_satelit.jpg'),
        loadTex('data/texture_polaruang.png')
      ]);

      const setupTex = (t) => {
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      };
      setupTex(texTopo);
      setupTex(texSatelit);
      setupTex(texPola);

      materials.maps3d = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.02
      });

      materials.topo = new THREE.MeshStandardMaterial({
        map: texTopo,
        roughness: 0.72,
        metalness: 0.05
      });

      materials.satelit = new THREE.MeshStandardMaterial({
        map: texSatelit,
        roughness: 0.80,
        metalness: 0.02
      });

      materials.polaruang = new THREE.MeshStandardMaterial({
        map: texPola,
        roughness: 0.68,
        metalness: 0.05
      });

      materials.clay = new THREE.MeshStandardMaterial({
        color: 0xf5f0ef,
        roughness: 0.88,
        metalness: 0.0
      });

      materials.skirt = new THREE.MeshStandardMaterial({
        color: 0xf1ece1,
        roughness: 0.92,
        metalness: 0.0,
        side: THREE.DoubleSide
      });

      materials.bottom = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        side: THREE.BackSide
      });

      materials.wireframe = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.4
      });

      loadingText.textContent = 'Merakit topografi, bangunan, kanopi hutan & perairan 3D…';
      buildTerrain3D();

      if (featuresData) {
        buildVectorOverlays();
      }
      if (waterData) {
        buildWaterBodies();
      }
      if (buildingsData) {
        buildBuildings();
      }
      if (treesData) {
        buildTrees();
      }
      if (forestClumpsData) {
        buildForestClumps();
      }

      updateStats();

      // Deep link kamera (e.g. ?cam=village)
      const urlParams = new URLSearchParams(window.location.search);
      const camParam = urlParams.get('cam');
      if (camParam === 'village') {
        setCamera(16.2, 3.8, -13.2, 18.0, 2.9, -15.2);
      } else if (camParam === 'dieng') {
        setCamera(22.0, 5.0, -18.0, 25.0, 3.2, -14.0);
      } else if (camParam === 'kota') {
        setCamera(8.2, 2.0, 8.8, 10.3, 0.8, 6.6);
      } else if (camParam === 'mrica') {
        setCamera(-2.5, 4.0, 18.5, 0.5, 1.2, 12.0);
      }

      if (urlParams.get('panel') === '0') {
        controlPanel.classList.add('is-collapsed');
        btnOpenPanel.classList.add('is-visible');
      }

      setTimeout(() => {
        loadingOverlay.classList.add('is-hidden');
      }, 400);

    } catch (err) {
      console.error(err);
      loadingText.textContent = 'Gagal memuat: ' + err.message;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3. Konstruksi Geometri 3D                                          */
  /* ------------------------------------------------------------------ */

  function buildTerrain3D() {
    webScale = terrainData.metadata.web_scale;
    vertexCount = terrainData.top.x.length;

    topGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
      positions[i * 3 + 0] = terrainData.top.x[i];
      positions[i * 3 + 1] = terrainData.top.z[i] * webScale * currentExaggeration;
      positions[i * 3 + 2] = -terrainData.top.y[i];

      uvs[i * 2 + 0] = terrainData.top.u[i];
      uvs[i * 2 + 1] = terrainData.top.v[i];
    }

    topGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    topGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    // Vertex Colors berdasarkan elevasi nyata (Maps3D Solid Topographic Style)
    // 0-40%: Hijau segar lembah/lereng (#4ade80)
    // 40-75%: Transisi ke abu-abu batuan perbukitan tinggi (#9ca3af)
    // 75-100%: Transisi ke putih puncak gunung Dieng / Prau (#ffffff)
    const minZ = terrainData.metadata.elevation.min;
    const maxZ = terrainData.metadata.elevation.max;
    const rangeZ = maxZ - minZ || 1;
    const elevColors = new Float32Array(vertexCount * 3);
    const cLow = new THREE.Color(0x4ade80);
    const cMid = new THREE.Color(0x9ca3af);
    const cHigh = new THREE.Color(0xffffff);

    for (let i = 0; i < vertexCount; i++) {
      const zNorm = Math.max(0, Math.min(1, (terrainData.top.z[i] - minZ) / rangeZ));
      const c = new THREE.Color();
      if (zNorm < 0.40) {
        c.copy(cLow);
      } else if (zNorm < 0.75) {
        c.lerpColors(cLow, cMid, (zNorm - 0.40) / 0.35);
      } else {
        c.lerpColors(cMid, cHigh, (zNorm - 0.75) / 0.25);
      }
      elevColors[i * 3 + 0] = c.r;
      elevColors[i * 3 + 1] = c.g;
      elevColors[i * 3 + 2] = c.b;
    }
    topGeometry.setAttribute('color', new THREE.BufferAttribute(elevColors, 3));

    topGeometry.setIndex(terrainData.top.faces);
    topGeometry.computeVertexNormals();

    topMesh = new THREE.Mesh(topGeometry, materials[currentMaterialKey]);
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    scene.add(topMesh);

    // Skirt (Side Walls)
    const bEdges = terrainData.boundary_edges;
    const skirtVerts = new Float32Array(bEdges.length * 4 * 3);
    const skirtIndices = [];
    const zBase = -1.8;

    for (let e = 0; e < bEdges.length; e++) {
      const [v1, v2] = bEdges[e];

      const x1 = terrainData.top.x[v1];
      const y1 = terrainData.top.z[v1] * webScale * currentExaggeration;
      const z1 = -terrainData.top.y[v1];

      const x2 = terrainData.top.x[v2];
      const y2 = terrainData.top.z[v2] * webScale * currentExaggeration;
      const z2 = -terrainData.top.y[v2];

      const baseV = e * 4;

      skirtVerts[baseV * 3 + 0] = x1;
      skirtVerts[baseV * 3 + 1] = y1;
      skirtVerts[baseV * 3 + 2] = z1;

      skirtVerts[(baseV + 1) * 3 + 0] = x1;
      skirtVerts[(baseV + 1) * 3 + 1] = zBase;
      skirtVerts[(baseV + 1) * 3 + 2] = z1;

      skirtVerts[(baseV + 2) * 3 + 0] = x2;
      skirtVerts[(baseV + 2) * 3 + 1] = zBase;
      skirtVerts[(baseV + 2) * 3 + 2] = z2;

      skirtVerts[(baseV + 3) * 3 + 0] = x2;
      skirtVerts[(baseV + 3) * 3 + 1] = y2;
      skirtVerts[(baseV + 3) * 3 + 2] = z2;

      skirtIndices.push(baseV, baseV + 1, baseV + 2);
      skirtIndices.push(baseV, baseV + 2, baseV + 3);
    }

    skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.BufferAttribute(skirtVerts, 3));
    skirtGeometry.setIndex(skirtIndices);
    skirtGeometry.computeVertexNormals();

    skirtMesh = new THREE.Mesh(skirtGeometry, materials.skirt);
    skirtMesh.castShadow = true;
    skirtMesh.receiveShadow = true;
    scene.add(skirtMesh);

    // Bottom Base Floor
    const bottomVerts = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      bottomVerts[i * 3 + 0] = terrainData.top.x[i];
      bottomVerts[i * 3 + 1] = zBase;
      bottomVerts[i * 3 + 2] = -terrainData.top.y[i];
    }
    bottomGeometry = new THREE.BufferGeometry();
    bottomGeometry.setAttribute('position', new THREE.BufferAttribute(bottomVerts, 3));
    const bFaces = [];
    for (let i = 0; i < terrainData.top.faces.length; i += 3) {
      bFaces.push(terrainData.top.faces[i], terrainData.top.faces[i + 2], terrainData.top.faces[i + 1]);
    }
    bottomGeometry.setIndex(bFaces);
    bottomGeometry.computeVertexNormals();

    bottomMesh = new THREE.Mesh(bottomGeometry, materials.bottom);
    scene.add(bottomMesh);
  }

  /* ------------------------------------------------------------------ */
  /* 4. Bangunan 3D (Instanced Mesh)                                    */
  /* ------------------------------------------------------------------ */

  function buildBuildings() {
    if (!buildingsData || buildingsData.length === 0) return;
    if (instancedBuildings) {
      scene.remove(instancedBuildings);
      instancedBuildings.geometry.dispose();
    }

    const count = buildingsData.length;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    geom.translate(0, 0.5, 0); // Origin di alas bangunan

    const mat = new THREE.MeshStandardMaterial({
      color: 0xf1ece1, // Putih krem maps3d
      roughness: 0.65,
      metalness: 0.04
    });

    instancedBuildings = new THREE.InstancedMesh(geom, mat, count);
    instancedBuildings.castShadow = true;
    instancedBuildings.receiveShadow = true;

    updateBuildingsY();
    instancedBuildings.visible = chkBuildings ? chkBuildings.checked : true;
    scene.add(instancedBuildings);
  }

  function updateBuildingsY() {
    if (!instancedBuildings || !buildingsData) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < buildingsData.length; i++) {
      const [px, pz, z_rel, w, l, h] = buildingsData[i];
      const y = z_rel * webScale * currentExaggeration;
      const actualH = Math.max(h * bldgScaleMultiplier * 1.5, 0.016);

      dummy.position.set(px, y, pz);
      dummy.scale.set(
        Math.max(w * bldgScaleMultiplier, 0.022),
        actualH,
        Math.max(l * bldgScaleMultiplier, 0.022)
      );
      dummy.updateMatrix();
      instancedBuildings.setMatrixAt(i, dummy.matrix);
    }
    instancedBuildings.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* 5. Pohon & Vegetasi 3D (Individual & Kanopi Hutan Bergerombol)    */
  /* ------------------------------------------------------------------ */

  function buildTreeGeometry() {
    // Geometri pohon ramping proporsional (serasi dengan tinggi rumah 1-2 lantai)
    // Batang tipis silindris
    const g1 = new THREE.CylinderGeometry(0.0012, 0.0018, 0.010, 5).toNonIndexed();
    g1.translate(0, 0.005, 0);
    // Mahkota daun icosahedron yang rapi
    const g2 = new THREE.IcosahedronGeometry(0.0055, 1).toNonIndexed();
    g2.translate(0, 0.0125, 0);

    const n1 = g1.attributes.position.count;
    const n2 = g2.attributes.position.count;
    const totalVerts = n1 + n2;

    const posArr = new Float32Array(totalVerts * 3);
    posArr.set(g1.attributes.position.array, 0);
    posArr.set(g2.attributes.position.array, n1 * 3);

    const normArr = new Float32Array(totalVerts * 3);
    normArr.set(g1.attributes.normal.array, 0);
    normArr.set(g2.attributes.normal.array, n1 * 3);

    const colArr = new Float32Array(totalVerts * 3);
    // Batang pohon: cokelat kayu alami (0.42, 0.28, 0.18)
    for (let i = 0; i < n1; i++) {
      colArr[i * 3 + 0] = 0.42;
      colArr[i * 3 + 1] = 0.28;
      colArr[i * 3 + 2] = 0.18;
    }
    // Mahkota daun: hijau zaitun segar maps3d (#4a7c3a -> 0.29, 0.49, 0.23)
    for (let i = n1; i < totalVerts; i++) {
      colArr[i * 3 + 0] = 0.29;
      colArr[i * 3 + 1] = 0.49;
      colArr[i * 3 + 2] = 0.23;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    merged.computeVertexNormals();
    return merged;
  }

  function buildTrees() {
    if (!treesData || treesData.length === 0) return;
    if (instancedTrees) {
      scene.remove(instancedTrees);
      instancedTrees.geometry.dispose();
      instancedTrees = null;
    }

    const count = treesData.length;
    const treeGeom = buildTreeGeometry();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0
    });

    instancedTrees = new THREE.InstancedMesh(treeGeom, mat, count);
    instancedTrees.castShadow = true;
    instancedTrees.receiveShadow = true;

    updateTreesY();
    scene.add(instancedTrees);
  }

  function updateTreesY() {
    if (!instancedTrees || !treesData) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treesData.length; i++) {
      const [px, pz, z_rel, scale, style] = treesData[i];
      const y = z_rel * webScale * currentExaggeration;
      const s = scale * treeScaleMultiplier;

      dummy.position.set(px, y, pz);
      dummy.scale.set(s, s, s);
      dummy.rotation.y = (i * 0.77) % Math.PI;
      dummy.updateMatrix();
      instancedTrees.setMatrixAt(i, dummy.matrix);
    }
    instancedTrees.instanceMatrix.needsUpdate = true;
  }

  function buildForestClumps() {
    if (!forestClumpsData || forestClumpsData.length === 0) return;
    if (instancedForestClumps) {
      scene.remove(instancedForestClumps);
      instancedForestClumps.geometry.dispose();
      instancedForestClumps = null;
    }

    const count = forestClumpsData.length;
    // Kubah hemisfer kanopi hutan pegunungan (phi 0 sampai PI/2 sehingga dasar berada di y=0)
    const clumpGeom = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);

    const clumpMat = new THREE.MeshStandardMaterial({
      color: 0x3d7335,
      roughness: 0.85,
      metalness: 0.02,
      flatShading: true
    });

    instancedForestClumps = new THREE.InstancedMesh(clumpGeom, clumpMat, count);
    instancedForestClumps.castShadow = true;
    instancedForestClumps.receiveShadow = true;

    // Palet warna hutan kanopi organik
    const colors = [
      new THREE.Color(0x2d5a27), // Hutan lindung lebat Dieng
      new THREE.Color(0x386630), // Kanopi pinus pegunungan
      new THREE.Color(0x467838), // Perkebunan lereng
      new THREE.Color(0x528442)  // Hutan lereng selatan
    ];

    for (let i = 0; i < count; i++) {
      instancedForestClumps.setColorAt(i, colors[i % colors.length]);
    }
    if (instancedForestClumps.instanceColor) {
      instancedForestClumps.instanceColor.needsUpdate = true;
    }

    updateForestClumpsY();
    scene.add(instancedForestClumps);
  }

  function updateForestClumpsY() {
    if (!instancedForestClumps || !forestClumpsData) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < forestClumpsData.length; i++) {
      const [px, pz, z_rel, r_clump, h_clump] = forestClumpsData[i];
      const y = z_rel * webScale * currentExaggeration + 0.005;
      const sR = r_clump * 2.2 * treeScaleMultiplier;
      const sH = Math.max(h_clump * 3.2 * treeScaleMultiplier, 0.08);

      dummy.position.set(px, y, pz);
      dummy.scale.set(sR, sH, sR);
      dummy.rotation.y = (i * 0.43) % Math.PI;
      dummy.updateMatrix();
      instancedForestClumps.setMatrixAt(i, dummy.matrix);
    }
    instancedForestClumps.instanceMatrix.needsUpdate = true;
  }

  function updateTreeLOD(camDist) {
    const isTreesChecked = chkTrees ? chkTrees.checked : true;
    if (!isTreesChecked) {
      if (instancedForestClumps) instancedForestClumps.visible = false;
      if (instancedTrees) instancedTrees.visible = false;
      return;
    }

    if (treeDisplayMode === 'clumps') {
      if (instancedForestClumps) instancedForestClumps.visible = true;
      if (instancedTrees) instancedTrees.visible = false;
    } else if (treeDisplayMode === 'indiv') {
      if (instancedForestClumps) instancedForestClumps.visible = false;
      if (instancedTrees) instancedTrees.visible = true;
    } else {
      // Auto LOD:
      // Jauh (> 42) = bergerombol di lereng & pegunungan
      // Dekat (<= 42) = pohon individual detail proporsional
      const isDistant = camDist > 42;
      if (instancedForestClumps) instancedForestClumps.visible = isDistant;
      if (instancedTrees) instancedTrees.visible = !isDistant;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6. Update Eksagerasi Elevasi                                       */
  /* ------------------------------------------------------------------ */

  function updateExaggeration(val) {
    currentExaggeration = parseFloat(val);
    lblExaggeration.textContent = `${currentExaggeration.toFixed(1)}x`;

    if (!topGeometry) return;

    // Update Top Surface
    const topPos = topGeometry.attributes.position.array;
    for (let i = 0; i < vertexCount; i++) {
      topPos[i * 3 + 1] = terrainData.top.z[i] * webScale * currentExaggeration;
    }
    topGeometry.attributes.position.needsUpdate = true;
    topGeometry.computeVertexNormals();

    // Update Skirt
    const skirtPos = skirtGeometry.attributes.position.array;
    const bEdges = terrainData.boundary_edges;
    for (let e = 0; e < bEdges.length; e++) {
      const [v1, v2] = bEdges[e];
      const y1 = terrainData.top.z[v1] * webScale * currentExaggeration;
      const y2 = terrainData.top.z[v2] * webScale * currentExaggeration;

      const baseV = e * 4;
      skirtPos[baseV * 3 + 1] = y1;
      skirtPos[(baseV + 3) * 3 + 1] = y2;
    }
    skirtGeometry.attributes.position.needsUpdate = true;
    skirtGeometry.computeVertexNormals();

    // Update Bangunan 3D, Pohon 3D & Kanopi Hutan
    updateBuildingsY();
    updateTreesY();
    updateForestClumpsY();

    // Update Vector Overlays (Jalan, Sungai, Waduk Mrica, Kecamatan, Landmark)
    updateVectorOverlays();
  }

  /* ------------------------------------------------------------------ */
  /* 7. Vektor Overlay (Jalan, Sungai, Waduk Mrica, Kecamatan, Landmark)*/
  /* ------------------------------------------------------------------ */

  function createRibbonGeometry(lines, halfWidth, yOffset) {
    let totalVerts = 0;
    let totalIndices = 0;

    for (let l = 0; l < lines.length; l++) {
      const pts = lines[l];
      if (!pts || pts.length < 2) continue;
      totalVerts += pts.length * 2;
      totalIndices += (pts.length - 1) * 6;
    }

    if (totalVerts === 0) return null;

    const positions = new Float32Array(totalVerts * 3);
    const baseElev = new Float32Array(totalVerts);
    const indices = new (totalVerts > 65535 ? Uint32Array : Uint16Array)(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    for (let l = 0; l < lines.length; l++) {
      const pts = lines[l];
      if (!pts || pts.length < 2) continue;
      const n = pts.length;
      const startV = vOffset;

      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const x = p[0];
        const elev = p[2];
        const z = -p[1];
        const y = elev * webScale * currentExaggeration + yOffset;

        let tx = 0, tz = 0;
        if (i === 0) {
          tx = pts[1][0] - pts[0][0];
          tz = -pts[1][1] - (-pts[0][1]);
        } else if (i === n - 1) {
          tx = pts[n - 1][0] - pts[n - 2][0];
          tz = -pts[n - 1][1] - (-pts[n - 2][1]);
        } else {
          tx = pts[i + 1][0] - pts[i - 1][0];
          tz = -pts[i + 1][1] - (-pts[i - 1][1]);
        }

        const len = Math.sqrt(tx * tx + tz * tz);
        let nx = 0, nz = 0;
        if (len > 1e-6) {
          nx = -tz / len;
          nz = tx / len;
        } else {
          nx = 1;
          nz = 0;
        }

        const segHalfWidth = Math.min(halfWidth, len * 0.4);

        const vLeft = vOffset + i * 2;
        const vRight = vOffset + i * 2 + 1;

        positions[vLeft * 3 + 0] = x + nx * segHalfWidth;
        positions[vLeft * 3 + 1] = y;
        positions[vLeft * 3 + 2] = z + nz * segHalfWidth;
        baseElev[vLeft] = elev;

        positions[vRight * 3 + 0] = x - nx * segHalfWidth;
        positions[vRight * 3 + 1] = y;
        positions[vRight * 3 + 2] = z - nz * segHalfWidth;
        baseElev[vRight] = elev;
      }

      for (let i = 0; i < n - 1; i++) {
        const p0 = startV + i * 2;
        const p1 = startV + i * 2 + 1;
        const p2 = startV + (i + 1) * 2;
        const p3 = startV + (i + 1) * 2 + 1;

        indices[iOffset++] = p0;
        indices[iOffset++] = p1;
        indices[iOffset++] = p2;

        indices[iOffset++] = p1;
        indices[iOffset++] = p3;
        indices[iOffset++] = p2;
      }

      vOffset += n * 2;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    geom.userData = { baseElev: baseElev, yOffset: yOffset };
    return geom;
  }

  function updateRibbonMeshY(mesh) {
    if (!mesh || !mesh.geometry || !mesh.geometry.userData || !mesh.geometry.userData.baseElev) return;
    const geom = mesh.geometry;
    const pos = geom.attributes.position.array;
    const baseElev = geom.userData.baseElev;
    const yOffset = geom.userData.yOffset || 0.008;
    const vCount = baseElev.length;
    for (let i = 0; i < vCount; i++) {
      pos[i * 3 + 1] = baseElev[i] * webScale * currentExaggeration + yOffset;
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
  }

  function buildVectorOverlays() {
    buildRoadLines();
    buildKecamatanLines();
    buildSungaiLines();
    buildLandmarks();
  }

  function buildRoadLines() {
    if (!featuresData || !featuresData.jalan) return;
    const group = vectorLayers.jalan.group;
    while (group.children.length > 0) group.remove(group.children[0]);

    // Pita 3D Ribbon selebar ~30m (halfWidth = 0.022) dengan polygonOffset agar bebas z-fighting
    const geom = createRibbonGeometry(featuresData.jalan, 0.022, 0.012);
    if (!geom) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xb0b4c0, // Abu-abu jalan maps3d
      roughness: 0.78,
      metalness: 0.08,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    roadMesh = new THREE.Mesh(geom, mat);
    roadMesh.name = 'RoadRibbonMesh';
    group.add(roadMesh);
  }

  function buildKecamatanLines() {
    const group = vectorLayers.kecamatan.group;
    while (group.children.length > 0) group.remove(group.children[0]);

    const mat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.85
    });

    featuresData.kecamatan.forEach((kec) => {
      const pts = kec.points;
      if (pts.length < 2) return;

      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        pos[i * 3 + 0] = pts[i][0];
        pos[i * 3 + 1] = pts[i][2] * webScale * currentExaggeration + 0.012;
        pos[i * 3 + 2] = -pts[i][1];
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(geom, mat);
      line.userData = { originalPts: pts };
      group.add(line);
    });
  }

  function buildSungaiLines() {
    if (!featuresData || !featuresData.sungai) return;
    const group = vectorLayers.sungai.group;

    if (riverMesh) {
      group.remove(riverMesh);
      riverMesh.geometry.dispose();
      riverMesh = null;
    }

    // Filter sungai utama: hanya sungai alami nyata (Sungai Serayu & anak-anak sungai utama)
    const filteredRivers = featuresData.sungai.filter((pts) => {
      if (!pts || pts.length < 4) return false;
      let totalL = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i+1][0] - pts[i][0];
        const dz = pts[i+1][1] - pts[i][1];
        totalL += Math.sqrt(dx * dx + dz * dz);
      }
      return totalL >= 2.5; // ~3.5 km panjang sungai alami
    });

    // Pita 3D Ribbon selebar ~20m (halfWidth = 0.014) dengan warna biru sungai jernih
    const geom = createRibbonGeometry(filteredRivers, 0.014, 0.007);
    if (!geom) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Biru sungai Serayu reflektif
      roughness: 0.2,
      metalness: 0.2,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    riverMesh = new THREE.Mesh(geom, mat);
    riverMesh.name = 'RiverRibbonMesh';
    group.add(riverMesh);
  }

  function buildWaterBodies() {
    if (!waterData || waterData.length === 0) return;
    const group = vectorLayers.sungai.group;

    if (waterBodiesMesh) {
      group.remove(waterBodiesMesh);
      waterBodiesMesh.geometry.dispose();
      waterBodiesMesh = null;
    }

    let totalVerts = 0;
    let totalIndices = 0;
    for (let i = 0; i < waterData.length; i++) {
      const wb = waterData[i];
      totalVerts += wb.vertices.length / 3;
      totalIndices += wb.indices.length;
    }

    const positions = new Float32Array(totalVerts * 3);
    const baseElev = new Float32Array(totalVerts);
    const indices = new (totalVerts > 65535 ? Uint32Array : Uint16Array)(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    for (let i = 0; i < waterData.length; i++) {
      const wb = waterData[i];
      const nV = wb.vertices.length / 3;
      const startV = vOffset;

      for (let k = 0; k < nV; k++) {
        const vx = wb.vertices[k * 3 + 0];
        const z_rel = wb.vertices[k * 3 + 1];
        const vz = wb.vertices[k * 3 + 2];
        const vy = z_rel * webScale * currentExaggeration + 0.004;

        positions[(vOffset + k) * 3 + 0] = vx;
        positions[(vOffset + k) * 3 + 1] = vy;
        positions[(vOffset + k) * 3 + 2] = vz;
        baseElev[vOffset + k] = z_rel;
      }

      for (let k = 0; k < wb.indices.length; k++) {
        indices[iOffset++] = startV + wb.indices[k];
      }

      vOffset += nV;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    geom.userData = { baseElev: baseElev, yOffset: 0.004 };

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Biru danau jernih reflektif Waduk Mrica
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.90,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });

    waterBodiesMesh = new THREE.Mesh(geom, waterMat);
    waterBodiesMesh.name = 'WadukMricaMesh';
    group.add(waterBodiesMesh);
  }

  function buildLandmarks() {
    const group = vectorLayers.landmarks.group;
    while (group.children.length > 0) group.remove(group.children[0]);
    landmarkElements.length = 0;
    pinsContainer.innerHTML = '';

    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.3,
      metalness: 0.4
    });

    featuresData.landmarks.forEach((lm) => {
      const pinGeom = new THREE.CylinderGeometry(0.08, 0.02, 0.6, 8);
      const pinMesh = new THREE.Mesh(pinGeom, pinMat);
      pinMesh.castShadow = true;
      pinMesh.userData = { lm: lm };

      const y = lm.z_rel * webScale * currentExaggeration;
      pinMesh.position.set(lm.x, y + 0.3, -lm.y);
      group.add(pinMesh);

      const labelEl = document.createElement('div');
      labelEl.className = 'pin-label';
      labelEl.title = `Klik untuk fokus ke ${lm.nama} (${lm.kategori})`;
      labelEl.innerHTML = `${lm.nama} <span class="elev-tag">${lm.elev} m</span>`;
      labelEl.addEventListener('click', () => {
        focusLandmark(lm);
      });
      pinsContainer.appendChild(labelEl);

      landmarkElements.push({
        element: labelEl,
        mesh: pinMesh,
        lm: lm
      });
    });
  }

  function focusLandmark(lm) {
    const y = lm.z_rel * webScale * currentExaggeration;
    animateCameraTo(lm.x, y + 20, -lm.y + 28, lm.x, y, -lm.y);
  }

  function updateVectorOverlays() {
    updateRibbonMeshY(roadMesh);
    updateRibbonMeshY(riverMesh);
    updateRibbonMeshY(waterBodiesMesh);

    // Update Kecamatan lines Y
    vectorLayers.kecamatan.group.children.forEach((line) => {
      if (line.userData && line.userData.originalPts) {
        const pts = line.userData.originalPts;
        const pos = line.geometry.attributes.position.array;
        for (let i = 0; i < pts.length; i++) {
          pos[i * 3 + 1] = pts[i][2] * webScale * currentExaggeration + 0.012;
        }
        line.geometry.attributes.position.needsUpdate = true;
      }
    });

    // Update Landmarks Y
    vectorLayers.landmarks.group.children.forEach((pinMesh) => {
      const lm = pinMesh.userData.lm;
      if (lm) {
        const y = lm.z_rel * webScale * currentExaggeration;
        pinMesh.position.y = y + 0.3;
      }
    });
  }

  function updateLandmarkDOMPins() {
    if (!vectorLayers.landmarks.visible) {
      landmarkElements.forEach(item => { item.element.style.display = 'none'; });
      return;
    }

    const tempV = new THREE.Vector3();
    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;

    landmarkElements.forEach((item) => {
      item.mesh.getWorldPosition(tempV);
      tempV.y += 0.5;
      tempV.project(camera);

      if (tempV.z < 1 && tempV.x >= -1 && tempV.x <= 1 && tempV.y >= -1 && tempV.y <= 1) {
        const x = (tempV.x * widthHalf) + widthHalf;
        const y = -(tempV.y * heightHalf) + heightHalf;
        item.element.style.display = 'block';
        item.element.style.left = `${x}px`;
        item.element.style.top = `${y}px`;
      } else {
        item.element.style.display = 'none';
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. Kontrol UI & Event Handlers                                     */
  /* ------------------------------------------------------------------ */

  function setupUIEvents() {
    const matButtons = document.querySelectorAll('.mat-btn');
    matButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        matButtons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const key = btn.dataset.mat;
        currentMaterialKey = key;
        if (topMesh && materials[key]) {
          topMesh.material = materials[key];
          topMesh.material.wireframe = chkWireframe.checked;
        }
      });
    });

    sliderExaggeration.addEventListener('input', (e) => {
      updateExaggeration(e.target.value);
    });

    if (sliderBldgScale) {
      sliderBldgScale.addEventListener('input', (e) => {
        bldgScaleMultiplier = parseFloat(e.target.value);
        lblBldgScale.textContent = `${bldgScaleMultiplier.toFixed(1)}x`;
        updateBuildingsY();
      });
    }

    if (sliderTreeScale) {
      sliderTreeScale.addEventListener('input', (e) => {
        treeScaleMultiplier = parseFloat(e.target.value);
        lblTreeScale.textContent = `${treeScaleMultiplier.toFixed(1)}x`;
        updateTreesY();
        updateForestClumpsY();
      });
    }

    // Tree Display Mode (Auto LOD, Bergerombol, Individual)
    const btnTreeAuto = document.getElementById('btn-tree-auto');
    const btnTreeClumps = document.getElementById('btn-tree-clumps');
    const btnTreeIndiv = document.getElementById('btn-tree-indiv');
    const treePills = [btnTreeAuto, btnTreeClumps, btnTreeIndiv];

    function setTreeMode(mode) {
      treeDisplayMode = mode;
      treePills.forEach(p => {
        if (p) p.classList.toggle('is-active', p.id === `btn-tree-${mode}`);
      });
      const camDist = camera.position.distanceTo(controls.target);
      updateTreeLOD(camDist);
    }

    if (btnTreeAuto) btnTreeAuto.addEventListener('click', () => setTreeMode('auto'));
    if (btnTreeClumps) btnTreeClumps.addEventListener('click', () => setTreeMode('clumps'));
    if (btnTreeIndiv) btnTreeIndiv.addEventListener('click', () => setTreeMode('indiv'));

    if (chkBuildings) {
      chkBuildings.addEventListener('change', (e) => {
        if (instancedBuildings) instancedBuildings.visible = e.target.checked;
      });
    }

    if (chkTrees) {
      chkTrees.addEventListener('change', () => {
        const camDist = camera.position.distanceTo(controls.target);
        updateTreeLOD(camDist);
      });
    }

    if (chkJalan) {
      chkJalan.addEventListener('change', (e) => {
        vectorLayers.jalan.visible = e.target.checked;
        vectorLayers.jalan.group.visible = e.target.checked;
      });
    }

    chkKecamatan.addEventListener('change', (e) => {
      vectorLayers.kecamatan.visible = e.target.checked;
      vectorLayers.kecamatan.group.visible = e.target.checked;
    });

    chkSungai.addEventListener('change', (e) => {
      vectorLayers.sungai.visible = e.target.checked;
      vectorLayers.sungai.group.visible = e.target.checked;
    });

    chkLandmarks.addEventListener('change', (e) => {
      vectorLayers.landmarks.visible = e.target.checked;
      vectorLayers.landmarks.group.visible = e.target.checked;
      if (!e.target.checked) {
        landmarkElements.forEach(item => { item.element.style.display = 'none'; });
      }
    });

    chkWireframe.addEventListener('change', (e) => {
      if (topMesh) {
        topMesh.material.wireframe = e.target.checked;
      }
    });

    btnAutoRotate.addEventListener('click', () => {
      isAutoRotating = !isAutoRotating;
      controls.autoRotate = isAutoRotating;
      controls.autoRotateSpeed = 1.2;
      txtAutoRotate.textContent = isAutoRotating ? 'Jeda' : 'Putar';
      btnAutoRotate.classList.toggle('is-active', isAutoRotating);
    });

    btnResetCam.addEventListener('click', () => {
      animateCameraTo(-8, 85, 120, -6, 0, 0);
    });

    document.querySelectorAll('.cam-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.cam;
        if (type === 'overview') {
          animateCameraTo(-8, 85, 120, -6, 0, 0);
        } else if (type === 'top') {
          animateCameraTo(-6, 160, 0.1, -6, 0, 0);
        } else if (type === 'south') {
          animateCameraTo(-6, 45, 100, -6, 5, -15);
        } else if (type === 'village') {
          // Tampilan lereng pedesaan Batur dengan jalan & deretan bangunan bertingkat
          animateCameraTo(16.2, 3.8, -13.2, 18.0, 2.9, -15.2);
        } else if (type === 'dieng') {
          // Dataran tinggi Dieng Batur
          animateCameraTo(22.0, 5.0, -18.0, 25.0, 3.2, -14.0);
        } else if (type === 'kota') {
          // Kota Banjarnegara di lembah Sungai Serayu
          animateCameraTo(8.2, 2.0, 8.8, 10.3, 0.8, 6.6);
        }
      });
    });

    btnClosePanel.addEventListener('click', () => {
      controlPanel.classList.add('is-collapsed');
      btnOpenPanel.classList.add('is-visible');
    });

    btnOpenPanel.addEventListener('click', () => {
      controlPanel.classList.remove('is-collapsed');
      btnOpenPanel.classList.remove('is-visible');
    });

    btnScreenshot.addEventListener('click', () => {
      takeScreenshot();
    });
  }

  function setCamera(targetX, targetY, targetZ, lookX, lookY, lookZ) {
    camera.position.set(targetX, targetY, targetZ);
    controls.target.set(lookX, lookY, lookZ);
    camera.lookAt(controls.target);
    controls.update();
  }

  let cameraAnimation = null;
  function animateCameraTo(targetX, targetY, targetZ, lookX, lookY, lookZ, instant = false) {
    if (instant) {
      setCamera(targetX, targetY, targetZ, lookX, lookY, lookZ);
      return;
    }
    cameraAnimation = {
      startPos: camera.position.clone(),
      endPos: new THREE.Vector3(targetX, targetY, targetZ),
      startTarget: controls.target.clone(),
      endTarget: new THREE.Vector3(lookX, lookY, lookZ),
      progress: 0,
      duration: 40
    };
    controls.enabled = false;
  }

  function takeScreenshot() {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `banjarnegara_3d_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function updateStats() {
    if (!terrainData) return;
    const elev = terrainData.metadata.elevation;
    statMin.textContent = `${elev.min.toLocaleString('id-ID')} mdpl`;
    statMax.textContent = `${elev.max.toLocaleString('id-ID')} mdpl`;
    statRange.textContent = `${Math.round(elev.max - elev.min).toLocaleString('id-ID')} m`;
  }

  /* ------------------------------------------------------------------ */
  /* 9. Render Loop                                                     */
  /* ------------------------------------------------------------------ */

  function animate() {
    requestAnimationFrame(animate);

    if (cameraAnimation) {
      cameraAnimation.progress++;
      const t = cameraAnimation.progress / cameraAnimation.duration;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      camera.position.lerpVectors(cameraAnimation.startPos, cameraAnimation.endPos, ease);
      controls.target.lerpVectors(cameraAnimation.startTarget, cameraAnimation.endTarget, ease);
      camera.lookAt(controls.target);

      if (cameraAnimation.progress >= cameraAnimation.duration) {
        camera.position.copy(cameraAnimation.endPos);
        controls.target.copy(cameraAnimation.endTarget);
        controls.enabled = true;
        controls.update();
        cameraAnimation = null;
      }
    } else {
      controls.update();
    }

    if (controls) {
      const camDist = camera.position.distanceTo(controls.target);
      updateTreeLOD(camDist);
    }

    updateLandmarkDOMPins();
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ */
  /* 10. Jalankan Aplikasi                                              */
  /* ------------------------------------------------------------------ */

  initThree();
  setupUIEvents();
  loadDataAndTextures();
  animate();

  window.app3d = {
    get scene() { return scene; },
    get camera() { return camera; },
    get controls() { return controls; },
    animateCameraTo: animateCameraTo,
    setCamera: setCamera
  };

})();
