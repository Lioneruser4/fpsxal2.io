// --- Global Değişkenler ---
let scene, camera, renderer;
let playerCar, playerGroup;
let trafficCars = [];
let roadSegments = [];
let isGameRunning = false;
let money = 0;
let lives = 3;
let speed = 0; // km/s
let maxSpeed = 180;
let acceleration = 0.5;
let deceleration = 0.8;
let playerX = 0;
let targetPlayerX = 0;
let playerZ = 0;
let roadWidth = 20;
let laneWidth = roadWidth / 4; // 4 şerit
let spawnDistance = 200;
let despawnDistance = 50;
let trafficDensity = 5;
let controlType = 'buttons';

// Fizik / Kontrol Değişkenleri
let keys = { left: false, right: false, gas: false, brake: false };
let joystickActive = false;
let joystickX = 0;
let wheelAngle = 0;

// Yol Dokusu (Prosedürel)
let roadTexture, grassTexture;

// --- Başlatma ---
function init() {
    // Sahne
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510); // Gece mavisi
    scene.fog = new THREE.Fog(0x050510, 50, 200); // Sis (derinlik hissi)

    // Kamera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Işıklar
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    scene.add(dirLight);

    // Yol ve Çevre
    createRoadTexture();
    createEnvironment();

    // Oyuncu Arabası
    createPlayerCar();

    // Olay Dinleyicileri
    window.addEventListener('resize', onWindowResize);
    setupControls();
    
    // UI Başlangıç
    document.getElementById('traffic-density').value = trafficDensity;
    updateLivesUI();
}

// --- Doku Üretimi (Harici dosya gerektirmez) ---
function createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Asfalt
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 256, 256);
    
    // Şerit çizgileri
    ctx.fillStyle = '#fff';
    // Sol şerit
    ctx.fillRect(60, 0, 4, 128); 
    // Sağ şerit
    ctx.fillRect(192, 0, 4, 128);
    // Orta kesikli çizgi
    ctx.fillRect(126, 0, 4, 64);
    ctx.fillRect(126, 128, 4, 64);

    roadTexture = new THREE.CanvasTexture(canvas);
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(1, 10); // Yol boyunca tekrar et
}

// --- Çevre ve Yol ---
function createEnvironment() {
    // Yol
    const roadGeo = new THREE.PlaneGeometry(roadWidth, 400);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.8 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -190; // İleri doğru
    road.receiveShadow = true;
    scene.add(road);
    roadSegments.push(road);

    // Çim / Zemin (Yolun dışı)
    const grassGeo = new THREE.PlaneGeometry(200, 400);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x113311 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.1, -190);
    scene.add(grass);

    // Yol Kenarı Çizgileri (Işıklı)
    for (let i = 0; i < 2; i++) {
        const x = i === 0 ? -roadWidth/2 + 1 : roadWidth/2 - 1;
        const lineGeo = new THREE.BoxGeometry(0.5, 0.1, 400);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(x, 0.05, -190);
        scene.add(line);
    }

    // Binalar / Sokak Lambaları (Sonsuz hissiyat için)
    for (let i = 0; i < 20; i++) {
        createBuilding(-20 - Math.random()*20, -i * 30 - 20);
        createBuilding(20 + Math.random()*20, -i * 30 - 20);
    }
}

function createBuilding(x, z) {
    const height = 20 + Math.random() * 40;
    const geo = new THREE.BoxGeometry(10, height, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x000011 });
    const building = new THREE.Mesh(geo, mat);
    building.position.set(x, height/2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);

    // Rastgele ışıklar (pencereler)
    const lightGeo = new THREE.PlaneGeometry(1, 1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for(let j=0; j<5; j++) {
        if(Math.random() > 0.5) {
            const light = new THREE.Mesh(lightGeo, lightMat);
            light.position.set(x + (Math.random()-0.5)*8, Math.random()*height, z + 5.1);
            scene.add(light);
        }
    }
}

// --- Araba Modeli (Prosedürel) ---
function createCarModel(color, isPlayer = false) {
    const group = new THREE.Group();

    // Gövde
    const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Kabin
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.7, 2);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 }); // Koyu cam
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.5, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Tekerlekler
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const positions = [
        {x: -1, z: 1.2}, {x: 1, z: 1.2}, // Ön
        {x: -1, z: -1.2}, {x: 1, z: -1.2} // Arka
    ];
    
    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.4, pos.z);
        wheel.castShadow = true;
        group.add(wheel);
    });

    // Farlar
    if(isPlayer) {
        const headlightGeo = new THREE.BoxGeometry(0.5, 0.2, 0.1);
        const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2 });
        
        const hl1 = new THREE.Mesh(headlightGeo, headlightMat);
        hl1.position.set(-0.6, 0.8, -2.01);
        group.add(hl1);
        
        const hl2 = new THREE.Mesh(headlightGeo, headlightMat);
        hl2.position.set(0.6, 0.8, -2.01);
        group.add(hl2);
        
        // Işık yansıması
        const light1 = new THREE.PointLight(0xffffcc, 1, 30);
        light1.position.set(-0.6, 0.8, -2);
        group.add(light1);
        const light2 = new THREE.PointLight(0xffffcc, 1, 30);
        light2.position.set(0.6, 0.8, -2);
        group.add(light2);
    } else {
        // Trafik araçları için arka stop lambaları
        const taillightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
        const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
        
        const tl1 = new THREE.Mesh(taillightGeo, taillightMat);
        tl1.position.set(-0.6, 0.8, 2.01);
        group.add(tl1);
        
        const tl2 = new THREE.Mesh(taillightGeo, taillightMat);
        tl2.position.set(0.6, 0.8, 2.01);
        group.add(tl2);
    }

    return group;
}

function createPlayerCar() {
    playerGroup = createCarModel(0xff0000, true); // Kırmızı oyuncu arabası
    playerGroup.position.set(0, 0, 0);
    scene.add(playerGroup);
    playerCar = playerGroup; // Referans
}

// --- Trafik Yönetimi ---
function spawnTrafficCar() {
    const lane = Math.floor(Math.random() * 4); // 0,1,2,3
    const xPos = -roadWidth/2 + (laneWidth / 2) + (lane * laneWidth);
    
    // Rastgele renk
    const colors = [0x0000ff, 0x00ff00, 0xffff00, 0xffffff, 0x888888, 0x00ffff];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const car = createCarModel(color, false);
    car.position.set(xPos, 0, -200 - Math.random() * 50); // İleride doğar
    car.userData = { lane: lane, speed: 40 + Math.random() * 40 }; // Trafik hızı
    scene.add(car);
    trafficCars.push(car);
}

function updateTraffic(delta) {
    // Trafik yoğunluğuna göre araç üret
    const spawnChance = trafficDensity * 0.005;
    if (Math.random() < spawnChance && trafficCars.length < trafficDensity * 5) {
        spawnTrafficCar();
    }

    for (let i = trafficCars.length - 1; i >= 0; i--) {
        const car = trafficCars[i];
        
        // Arabaları ileri doğru hareket ettir (Oyuncuya doğru değil, dünya oyuncunun etrafında döner)
        // Aslında oyuncu ileri gidiyor, trafik yavaş.
        // Burada trafik araçlarının hızını simüle ediyoruz.
        car.position.z += car.userData.speed * delta * 0.5; 

        // Çarpışma Kontrolü (Sadece oyuncunun önü)
        // Oyuncunun Z pozisyonu 0'a yakın, trafik -Z'den +Z'ye geliyor (oyuncuya doğru)
        // Ancak oyuncu ileri gittiği için, trafik araçları geriye doğru hareket ediyormuş gibi görünmeli.
        // Basitleştirilmiş mantık: Oyuncu Z ekseninde ilerler, trafik sabit hızla gider.
        
        // Mesafe kontrolü
        const distZ = car.position.z - playerGroup.position.z;
        const distX = Math.abs(car.position.x - playerGroup.position.x);

        // Kaza Kontrolü (Önümüzdeki araç)
        if (distZ > -2 && distZ < 4 && distX < 2.2) {
            handleCrash();
        }
        
        // Geçiş Parası (Arabanın yanından geçince)
        if (!car.userData.passed && distZ > 5) {
            car.userData.passed = true;
            money += 10;
            document.getElementById('money').innerText = money;
        }

        // Ekrandan çıkanları temizle
        if (car.position.z > 20) {
            scene.remove(car);
            trafficCars.splice(i, 1);
        }
    }
}

// --- Çarpışma ve Oyun Sonu ---
function handleCrash() {
    if (!isGameRunning) return;
    
    lives--;
    updateLivesUI();
    
    // Kaza efekti (Kamera sarsıntısı)
    camera.position.x += (Math.random() - 0.5) * 1;
    camera.position.y += (Math.random() - 0.5) * 1;

    if (lives <= 0) {
        gameOver();
    } else {
        // Kaza sonrası yavaşla ve trafiği temizle (Oyun devam etsin)
        speed = 0;
        playerGroup.position.x = 0; // Ortaya dön
        trafficCars.forEach(car => scene.remove(car));
        trafficCars = [];
    }
}

function updateLivesUI() {
    let hearts = '';
    for (let i = 0; i < 3; i++) {
        hearts += i < lives ? '❤' : '🖤';
    }
    document.getElementById('lives').innerText = hearts;
}

function gameOver() {
    isGameRunning = false;
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('final-money').innerText = money;
    document.getElementById('controls').style.display = 'none';
}

function restartGame() {
    document.getElementById('game-over').style.display = 'none';
    startGame();
}

function startGame() {
    // UI Gizle
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'none';
    document.getElementById('controls').style.display = 'block';

    // Değişkenleri sıfırla
    money = 0;
    lives = 3;
    speed = 0;
    playerX = 0;
    playerZ = 0;
    playerGroup.position.set(0, 0, 0);
    playerGroup.rotation.set(0, 0, 0);
    
    // Trafiği temizle
    trafficCars.forEach(car => scene.remove(car));
    trafficCars = [];

    // UI Güncelle
    document.getElementById('money').innerText = money;
    document.getElementById('speed').innerText = "0";
    updateLivesUI();

    isGameRunning = true;
}

// --- Kontroller ---
function setupControls() {
    // Klavye
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
        if (e.key === 'ArrowUp' || e.key === 'w') keys.gas = true;
        if (e.key === 'ArrowDown' || e.key === 's') keys.brake = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
        if (e.key === 'ArrowUp' || e.key === 'w') keys.gas = false;
        if (e.key === 'ArrowDown' || e.key === 's') keys.brake = false;
    });

    // Butonlar
    document.getElementById('left-btn').addEventListener('touchstart', (e) => { e.preventDefault(); keys.left = true; });
    document.getElementById('left-btn').addEventListener('touchend', (e) => { e.preventDefault(); keys.left = false; });
    document.getElementById('right-btn').addEventListener('touchstart', (e) => { e.preventDefault(); keys.right = true; });
    document.getElementById('right-btn').addEventListener('touchend', (e) => { e.preventDefault(); keys.right = false; });

    // Gaz / Fren
    document.getElementById('gas').addEventListener('touchstart', (e) => { e.preventDefault(); keys.gas = true; });
    document.getElementById('gas').addEventListener('touchend', (e) => { e.preventDefault(); keys.gas = false; });
    document.getElementById('brake').addEventListener('touchstart', (e) => { e.preventDefault(); keys.brake = true; });
    document.getElementById('brake').addEventListener('touchend', (e) => { e.preventDefault(); keys.brake = false; });

    // Joystick
    const joyBase = document.getElementById('joystick-base');
    const joyStick = document.getElementById('joystick-stick');
    let joyRect;

    joyBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickActive = true;
        joyRect = joyBase.getBoundingClientRect();
        updateJoystick(e.touches[0]);
    });
    
    joyBase.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (joystickActive) updateJoystick(e.touches[0]);
    });
    
    joyBase.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystickActive = false;
        joystickX = 0;
        joyStick.style.transform = `translate(0px, 0px)`;
    });

    function updateJoystick(touch) {
        const centerX = joyRect.left + joyRect.width / 2;
        const centerY = joyRect.top + joyRect.height / 2;
        let deltaX = touch.clientX - centerX;
        let deltaY = touch.clientY - centerY;
        
        // Sınırla
        const maxDist = 30;
        const dist = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
        if (dist > maxDist) {
            deltaX = (deltaX / dist) * maxDist;
            deltaY = (deltaY / dist) * maxDist;
        }
        
        joyStick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        joystickX = deltaX / maxDist; // -1 ile 1 arası
    }

    // Direksiyon
    const wheelView = document.getElementById('wheel-view');
    let wheelTouching = false;
    let wheelStartX = 0;
    
    wheelView.addEventListener('touchstart', (e) => {
        e.preventDefault();
        wheelTouching = true;
        wheelStartX = e.touches[0].clientX;
    });
    
    wheelView.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!wheelTouching) return;
        const deltaX = e.touches[0].clientX - wheelStartX;
        wheelAngle = deltaX * 0.5; // Hassasiyet
        wheelAngle = Math.max(-90, Math.min(90, wheelAngle));
        wheelView.style.transform = `rotate(${wheelAngle}deg)`;
        
        // Direksiyon dönüşünü değere çevir
        if (wheelAngle < -10) keys.left = true; else keys.left = false;
        if (wheelAngle > 10) keys.right = true; else keys.right = false;
    });
    
    wheelView.addEventListener('touchend', (e) => {
        e.preventDefault();
        wheelTouching = false;
        wheelAngle = 0;
        wheelView.style.transform = `rotate(0deg)`;
        keys.left = false;
        keys.right = false;
    });
}

// --- UI Fonksiyonları ---
function openSettings() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'block';
}

function closeSettings() {
    document.getElementById('settings-panel').style.display = 'none';
    document.getElementById('lobby').style.display = 'flex';
    
    // Ayarları uygula
    trafficDensity = parseInt(document.getElementById('traffic-density').value);
    controlType = document.getElementById('control-type').value;
    
    // Kontrolleri göster/gizle
    document.getElementById('btn-controls').style.display = controlType === 'buttons' ? 'flex' : 'none';
    document.getElementById('joystick-base').style.display = controlType === 'joystick' ? 'block' : 'none';
    document.getElementById('wheel-view').style.display = controlType === 'wheel' ? 'block' : 'none';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Oyun Döngüsü ---
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    if (isGameRunning) {
        updateGame(delta);
    }
    
    renderer.render(scene, camera);
}

function updateGame(delta) {
    // Hızlanma / Yavaşlama
    if (keys.gas) {
        speed += acceleration;
        if (speed > maxSpeed) speed = maxSpeed;
    } else if (keys.brake) {
        speed -= deceleration;
        if (speed < 0) speed = 0;
    } else {
        // Doğal yavaşlama (sürtünme)
        speed -= 0.1;
        if (speed < 0) speed = 0;
    }

    // Direksiyon
    let steerAmount = 0;
    if (keys.left) steerAmount = -1;
    if (keys.right) steerAmount = 1;
    if (controlType === 'joystick' && joystickX !== 0) steerAmount = joystickX;

    // Hıza bağlı dönüş hızı
    const turnSpeed = 0.5 + (speed / maxSpeed) * 1.5;
    targetPlayerX += steerAmount * turnSpeed * delta * 60;

    // Yol sınırları
    const maxX = roadWidth / 2 - 2;
    if (targetPlayerX > maxX) targetPlayerX = maxX;
    if (targetPlayerX < -maxX) targetPlayerX = -maxX;

    // Yumuşak geçiş
    playerX += (targetPlayerX - playerX) * 0.2;
    
    // Arabayı güncelle
    playerGroup.position.x = playerX;
    // Direksiyon dönüşü (görsel)
    if (steerAmount !== 0) {
        playerGroup.rotation.y = -steerAmount * 0.2;
    } else {
        playerGroup.rotation.y = 0;
    }

    // İleri hareket (Hızı Z pozisyonuna uygula)
    // Oyuncu ileri giderken aslında dünya geriye gelir, bu yüzden trafik araçlarını yönetiyoruz.
    // Basitleştirmek için, oyuncunun Z pozisyonunu sabit tutup, trafik araçlarını hız * delta kadar geriye itebiliriz.
    // Veya oyuncuyu ileri itip kamerayı takip ettirebiliriz.
    // Şu anki sistemde trafik araçları +Z yönünde (oyuncuya doğru) hareket ediyor.
    // Oyuncunun hızı arttıkça trafik daha hızlı yaklaşmalı.
    
    // Hız göstergesi
    document.getElementById('speed').innerText = Math.floor(speed);

    // Trafik güncellemesi (Oyuncunun hızına göre trafik araçlarının yaklaşma hızını artır)
    updateTraffic(delta * (1 + speed / 50)); // Hız arttıkça zaman daha hızlı akar

    // Kamera takibi (Yumuşak)
    camera.position.x += (playerX * 0.5 - camera.position.x) * 0.1;
    camera.position.y = 5 + (speed / maxSpeed) * 1; // Hızlandıkça kamera hafif yükselir
    camera.lookAt(playerX, 1, -20); // İleriye bak
}

// Başlat
init();
animate();
