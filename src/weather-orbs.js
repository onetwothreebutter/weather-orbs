const canvasSketch = require('canvas-sketch');
const createShader = require('canvas-sketch-util/shader');
const glslify = require('glslify');
//dependency on 'glsl-noise/simplex/4d' for below glslify
//dependency on 'glsl-hsl2rgb' for below glslify
const axios = require('axios');





global.THREE = require('three');

// Include any additional ThreeJS examples below
require('three/examples/js/controls/OrbitControls');


// Setup our sketch
const settings = {
  context: 'webgl',
  animate: true,
  attributes : { antialias: true }
};

// Your sketch, which simply returns the shader
const sketch = ({ context }) => {

  // Create renderer
  const renderer = new THREE.WebGLRenderer({ context });

  // WebGL background color
  renderer.setClearColor('hsl(0, 0%, 95%)', 1);

  // Setup Camera
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(2, 2, -4);
  camera.lookAt(new THREE.Vector3());

  // Setup camera controller
  const controls = new THREE.OrbitControls(camera);

  // Setup your scene
  const scene = new THREE.Scene();

  const vertexShader = glslify(`
    varying vec2 vUv;

    uniform float time;

    #pragma glslify: noise = require('glsl-noise/simplex/4d');
 
    void main () {
      vUv = uv;

      vec3 transformed = position.xyz;

      float offset = 0.0;
      offset += 0.3 * noise(vec4(position.xyz * 0.5, time * 0.25));
      offset += 0.25 * noise(vec4(position.xyz * 1.5, time * 0.25));

      transformed += normal * offset;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `);

  const fragmentShader = glslify(`
    varying vec2 vUv;
    uniform float time;

    #pragma glslify: hsl2rgb = require('glsl-hsl2rgb');

    void main () {
      float hue = mix(0.2, 0.5, sin(vUv.x * 3.14));
      vec3 color = hsl2rgb(vec3(hue, 0.5, vUv.y));
      gl_FragColor = vec4(color, 1.0);
    }
  `);


  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      flatShading: true,
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader,
      uniforms: {
        time: {
          value: 0
        }
      }
    })
  );

  scene.add(mesh);

  // draw each frame
  return {
    // Handle resize events here
    resize ({ pixelRatio, viewportWidth, viewportHeight }) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(viewportWidth, viewportHeight);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    },
    // Update & render your scene here
    render ({ time }) {
      mesh.rotation.y = time;
      mesh.material.uniforms.time.value = time;
      controls.update();
      renderer.render(scene, camera);
    },
    // Dispose of events & renderer for cleaner hot-reloading
    unload () {
      controls.dispose();
      renderer.dispose();
    }
  };

};



async function getWeatherData() {
  try {

    let url = 'http://localhost:9000/get-weather-data?lat=41.673400&lon=-91.757050';

    console.log(await axios.post(url));
    //{
    // apparentTemperature: 32.72
    // cloudCover: 0.9
    // dewPoint: 31.39
    // humidity: 0.85
    // icon: "partly-cloudy-night"
    // nearestStormBearing: 179
    // nearestStormDistance: 147
    // ozone: 348.68
    // precipIntensity: 0
    // precipProbability: 0
    // pressure: 1018.4
    // summary: "Mostly Cloudy"
    // temperature: 35.54
    // time: 1552099066 // use momentjs to get time of day?
    // uvIndex: 0
    // visibility: 2.2
    // windBearing: 109
    // windGust: 7.8
    // windSpeed: 3.49
    // } = data.data.currently

    canvasSketch(sketch, settings);

  } catch (error) {
    console.error(error);
  }

}

console.log(getWeatherData());

