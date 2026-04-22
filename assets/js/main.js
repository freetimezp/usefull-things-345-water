import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js";

const canvas = document.getElementById("webgl");

/* SCENE */
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* RENDERER */
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/* 🔥 RENDER TARGET (THIS IS THE MAGIC) */
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

/* 🎨 BACKGROUND SCENE (what will be distorted) */
const bgScene = new THREE.Scene();
const bgMaterial = new THREE.ShaderMaterial({
    uniforms: {
        u_time: { value: 0 },
    },
    vertexShader: `
        void main() {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
    uniform float u_time;

    // cheap hash noise
    float hash(vec2 p){
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
    }

    float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x)
             + (c - a) * u.y * (1.0 - u.x)
             + (d - b) * u.x * u.y;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${window.innerWidth.toFixed(1)}, ${window.innerHeight.toFixed(1)});

        // vertical deep ocean gradient
        vec3 deepTop = vec3(0.02, 0.08, 0.15);
        vec3 deepBottom = vec3(0.01, 0.02, 0.05);
        vec3 col = mix(deepBottom, deepTop, uv.y);

        // moving light caustics
        float caustic = sin((uv.x * 10.0 + u_time * 0.6)) * 
                        cos((uv.y * 8.0 - u_time * 0.4));

        caustic = pow(abs(caustic), 2.0);

        col += caustic * 0.08;

        // drifting noise fog
        float n = noise(uv * 3.0 + u_time * 0.05);
        col += n * 0.03;

        // subtle vignette
        float vignette = smoothstep(1.2, 0.2, length(uv - 0.5));
        col *= vignette;

        gl_FragColor = vec4(col, 1.0);
    }
`,
});

const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
bgScene.add(bgMesh);

/* 🌊 WATER SHADER (REAL REFRACTION) */
const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
        u_time: { value: 0 },
        u_texture: { value: renderTarget.texture },
        u_resolution: {
            value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
    },
    vertexShader: `
        void main() {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float u_time;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;

        float wave(vec2 p) {
            float w = 0.0;
            w += sin(p.x * 6.0 + u_time) * 0.02;
            w += sin(p.y * 8.0 + u_time * 1.2) * 0.02;
            w += sin((p.x + p.y) * 4.0 + u_time * 0.7) * 0.03;
            return w;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;

            vec2 p = uv * 2.0 - 1.0;

            float w = wave(p);

            // 🔥 REAL REFRACTION
            vec2 refractedUV = uv + vec2(w);

            vec3 bg = texture2D(u_texture, refractedUV).rgb;

            // water tint
            vec3 waterColor = vec3(0.0, 0.4, 0.6);

            vec3 color = mix(bg, waterColor, 0.3);

            // highlight
            float light = sin((uv.x + uv.y + u_time) * 20.0) * 0.5 + 0.5;
            color += light * 0.15;

            // transparency
            float alpha = 0.6 + w * 2.0;

            gl_FragColor = vec4(color, alpha);
        }
    `,
});

const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waterMaterial);
scene.add(waterMesh);

/* ⏱ ANIMATION */
const clock = new THREE.Clock();

function animate() {
    const t = clock.getElapsedTime();

    bgMaterial.uniforms.u_time.value = t * 0.2;
    waterMaterial.uniforms.u_time.value = t * 0.2;

    // 1️⃣ render background into texture
    renderer.setRenderTarget(renderTarget);
    renderer.render(bgScene, camera);

    // 2️⃣ render final scene
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}

animate();

/* 📱 RESIZE */
window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderTarget.setSize(window.innerWidth, window.innerHeight);

    waterMaterial.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
});
