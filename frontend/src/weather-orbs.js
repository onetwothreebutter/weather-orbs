const canvasSketch = require("canvas-sketch");
const createShader = require("canvas-sketch-util/shader");
const glslify = require("glslify");
//dependency on 'glsl-noise/simplex/4d' for below glslify
//dependency on 'glsl-hsl2rgb' for below glslify
const axios = require("axios");
const temperaturePalette = require("./temperatureColorPalette");
const colorBetween = require("color-between");
const hsl2rgb = require("@charlesstover/hsl2rgb");
const hex2rgb = require("hex-rgb");
const color = require("color");
const differenceInSeconds = require("date-fns/difference_in_seconds");
const suncalc = require("suncalc");
const lerp = require("lerp");
const eases = require("eases");

global.THREE = require("three");

// Include any additional ThreeJS examples below
require("three/examples/js/controls/OrbitControls");

// Setup our sketch
const settings = {
  context: "webgl",
  animate: true,
  attributes: { antialias: true },
  cloudCover: 0,
  precipIntensity: 1.5,
  noiseMultiplier: 1.0,
};

// Your sketch, which simply returns the shader
const sketch = ({ context }) => {
  // Create renderer
  const renderer = new THREE.WebGLRenderer({ context });

  // WebGL background color
  renderer.setClearColor("hsl(0, 0%, 95%)", 1);

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
    uniform float weatherColor;
    uniform float daylightValue;
    uniform float saturation;
    uniform float precipIntensity;    
    uniform float windSpeed;
    uniform float noiseMultiplier;
    

    #pragma glslify: noise = require('glsl-noise/simplex/4d');
 
    void main () {
      vUv = uv;

      vec3 transformed = position.xyz;

      float offset = 0.0;
      offset += 0.3 * noise(vec4(position.xyz * 0.5, time * 0.25));
      
      float smoothness = precipIntensity; //precipitation, 3.5 is spiky which means rain, 1.5 is no precip
      float undulation = windSpeed; //wind speed
      offset += (0.25 * noiseMultiplier) * noise(vec4(position.xyz * smoothness, time * undulation));

      float rainIntensity = 1.0;
      transformed += rainIntensity * normal * offset;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `);

  const fragmentShader = glslify(`
    varying vec2 vUv;
    uniform float time;
    uniform float weatherColor;
    uniform float daylightValue;
    uniform float saturation;
    
    
    #pragma glslify: hsl2rgb = require('glsl-hsl2rgb');

    void main () {
      //float hue = mix(0.2, 0.5, sin(vUv.x * 3.14));
      
      // restrict the lightness to a smaller range so we don't get such a strong gradient
      float lightnessFloor = (daylightValue >= 2.0) ? 0.3 : 0.4;
      float lightnessCeiling = (daylightValue >= 2.0) ? 0.6 : 0.85;
      float y = (vUv.y < lightnessFloor) ? lightnessFloor : (vUv.y > lightnessCeiling) ? lightnessCeiling : vUv.y;
      vec3 color = hsl2rgb(vec3(weatherColor, saturation, (y / daylightValue)));
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
        },
        weatherColor: {
          value: 0.0
        },
        cloudCover: {
          value: 1.0
        },
        daylightValue: {
          value: 1.0
        },
        saturation: {
          value: 1.0
        },
        precipIntensity: {
          value: 1.5
        },
        windSpeed: {
          value: 0.25
        },
        noiseMultiplier: {
          value: 1.0
        }
      }
    })
  );

  scene.add(mesh);

  updateWeatherData();
  setInterval(function() {
    updateWeatherData();
  }, 60000);

  // draw each frame
  return {
    // Handle resize events here
    resize({ pixelRatio, viewportWidth, viewportHeight }) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(viewportWidth, viewportHeight);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    },
    // Update & render your scene here
    render({ time }) {
      mesh.rotation.y = time / 4;
      //mesh.rotation.y = Math.sin(time * (Math.PI / 6));
      mesh.material.uniforms.time.value = time;
      mesh.material.uniforms.weatherColor.value = settings.weatherColor;
      mesh.material.uniforms.daylightValue.value = settings.daylightValue;
      mesh.material.uniforms.saturation.value = settings.saturation;
      mesh.material.uniforms.precipIntensity.value = settings.precipIntensity;
      mesh.material.uniforms.windSpeed.value = settings.windSpeed;
      mesh.material.uniforms.noiseMultiplier.value = settings.noiseMultiplier;
      controls.update();
      //renderer.setClearColor(`hsl(0, 0%, ${settings.cloudCover}%)`, 1);
      renderer.render(scene, camera);
    },
    // Dispose of events & renderer for cleaner hot-reloading
    unload() {
      controls.dispose();
      renderer.dispose();
    }
  };
};

async function getWeatherData(lat, lon) {
  try {
    let url = `https://weather-orb.netlify.com/.netlify/functions/get-weather-data?lat=${lat}&lon=${lon}`;
    return await axios.post(url);
  } catch (error) {
    console.error(error);
  }
}

function updateWeatherData() {
  const lat = 41.6734;
  const lon = -91.75705;

  Promise.all([getWeatherData(lat, lon)]).then(res => {
    //extract data from different APIs
    let { darksky, openWeatherMap } = res[0].data;

    console.log(res[0].data);

    //round to the nearest 10
    let { temperature } = darksky.currently;
    let nearestTemps = {
      floor: Math.floor(temperature / 10) * 10,
      ceil: Math.ceil(temperature / 10) * 10
    };

    //our temperature palette has colors every 10 degrees
    let nearestTempColors = {
      low: temperaturePalette.filter(item => item.temp == nearestTemps.floor)[0]
        .color,
      high: temperaturePalette.filter(item => item.temp == nearestTemps.ceil)[0]
        .color,
      gradient: (temperature - nearestTemps.floor) / 10
    };

    let colorForTemp = colorBetween(
      nearestTempColors.low,
      nearestTempColors.high,
      nearestTempColors.gradient
    );

    //Hazel color adjustment
    //colorForTemp = '#a82dff';
    colorForTemp = color(colorForTemp).hsl();
    settings.weatherColor = colorForTemp.color[0] / 360.0; //convert to radians

    //determine the kind of daylight
    let suninfo = suncalc.getTimes(new Date(), lat, lon);
    console.log(suninfo);
    // pre-dawn
    if (
      new Date() >= new Date(suninfo.nightEnd) &&
      new Date() < new Date(suninfo.dawn)
    ) {
      settings.daylightValue = 2.3;
      settings.saturation = 0.2;
    }
    // dawn
    else if (
      new Date() >= new Date(suninfo.dawn) &&
      new Date() < new Date(suninfo.sunrise)
    ) {

      const dawnDuration = differenceInSeconds(
        new Date(suninfo.sunrise),
        new Date(suninfo.dawn)
      );
      const dawnProgress = differenceInSeconds(
        new Date(),
        new Date(suninfo.sunrise)
      );

      const progress = eases.cubicIn(dawnProgress / dawnDuration);
      settings.daylightValue = lerp(2.3, 1.8, progress);
      settings.saturation = lerp(0.2, 0.6, progress);
    }
    // sunrise
    else if (
      new Date() >= new Date(suninfo.sunrise) &&
      new Date() < new Date(suninfo.sunriseEnd)
    ) {
      const sunriseDuration = differenceInSeconds(
        new Date(suninfo.sunriseEnd),
        new Date(suninfo.sunrise)
      );
      const sunriseProgress = differenceInSeconds(
        new Date(),
        new Date(suninfo.sunrise)
      );


      const progress = eases.cubicOut(sunriseProgress / sunriseDuration);

      settings.daylightValue = lerp(1.8, 1.2, progress);
      settings.saturation = lerp(0.6, 0.7, progress);

    }
    // golden hour
    else if (
      new Date() >= new Date(suninfo.sunriseEnd) &&
      new Date() < new Date(suninfo.goldenHourEnd)
    ) {
      settings.daylightValue = 1.2;
      settings.saturation = 0.7;
    }
    // morning
    else if (
      new Date() >= new Date(suninfo.goldenHourEnd) &&
      new Date() < new Date(suninfo.solarNoon)
    ) {
      settings.daylightValue = 1.0;
      settings.saturation = 1.0;
    }
    // afternoon
    else if (
      new Date() >= new Date(suninfo.solarNoon) &&
      new Date() < new Date(suninfo.goldenHour)
    ) {
      settings.daylightValue = 1.0;
      settings.saturation = 1.0;
    }
    // golden hour
    else if (
      new Date() >= new Date(suninfo.goldenHour) &&
      new Date() < new Date(suninfo.sunsetStart)
    ) {
      settings.daylightValue = 1.0;
      settings.saturation = 1.0;
    }
    // sunset
    else if (
      new Date() >= new Date(suninfo.sunsetStart) &&
      new Date() < new Date(suninfo.sunset)
    ) {
      const secondsBetween = differenceInSeconds(
        new Date(suninfo.sunset),
        new Date(suninfo.sunsetStart)
      );
      const secondsOfProgress = differenceInSeconds(
        new Date(),
        new Date(suninfo.sunsetStart)
      );
      const progress = secondsOfProgress / secondsBetween;

      settings.daylightValue = lerp(1.0, 1.4, progress);
      settings.saturation = 1.0;
    }
    // twilight
    else if (
      new Date() >= new Date(suninfo.sunset) &&
      new Date() < new Date(suninfo.dusk)
    ) {
      settings.daylightValue = 1.4;
      settings.saturation = 0.3;
    }
    // dusk
    else if (
      new Date() >= new Date(suninfo.dusk) &&
      new Date() < new Date(suninfo.night)
    ) {
      settings.daylightValue = 2.0;
      settings.saturation = 0.3;
    }
    // night
    else {
      settings.daylightValue = 2.5;
      settings.saturation = 0.2;
    }



    // Cloud Clover
    let { cloudCover } = darksky.currently;
    let hslLightnessForBg = 95.0;
    settings.cloudCover = Math.round((1 - cloudCover) * hslLightnessForBg);

    // Precipitation
    let { precipIntensity } = darksky.currently;

    if (precipIntensity === 0) {
      settings.precipIntensity = 1.0;
    } else if (precipIntensity < 0.03) {
      settings.precipIntensity = lerp(
        2.8,
        3.0,
        calculateProgress(0, 0.03, precipIntensity)
      );
    } else if (precipIntensity >= 0.03 && precipIntensity < 0.1) {
      settings.precipIntensity = lerp(
        3.0,
        4.0,
        calculateProgress(0.03, 0.1, precipIntensity)
      );
    } else if (precipIntensity >= 0.1 && precipIntensity < 0.2) {
      let progress = calculateProgress(0.1, 0.2, precipIntensity);
      settings.precipIntensity = lerp(
        3.0,
        3.5,
        progress
      );
      settings.noiseMultiplier = lerp(1.5, 2.0, progress);
    } else {
      let precipMultiplier = (precipIntensity / 0.2)
      settings.precipIntensity = 3.5 * precipMultiplier;
      settings.noiseMultiplier = 2.0 * precipMultiplier;
    }

    // Wind Speed
    let { windSpeed } = darksky.currently;
    if (windSpeed < 5) {
      settings.windSpeed = lerp(0, 0.25, calculateProgress(0, 5, windSpeed));
    } else if (windSpeed >= 5 && windSpeed < 10) {
      settings.windSpeed = lerp(0.25, 0.45, calculateProgress(5, 10, windSpeed));
    } else if (windSpeed >= 10 && windSpeed < 20) {
      settings.windSpeed = lerp(0.45, 1.0, calculateProgress(10, 20, windSpeed));
    } else if (windSpeed >= 20 && windSpeed < 30) {
      settings.windSpeed = lerp(1.0, 2.5, calculateProgress(20, 30, windSpeed));
    } else {
      settings.windSpeed = 3.5;
      let windMultiplier = windSpeed / 30;
      settings.windSpeed = 3.5 * windMultiplier;
    }

    console.log(settings);
  });
}

function calculateProgress(minValue, maxValue, currentValue) {
  return (currentValue - minValue) / (maxValue - minValue);
}

canvasSketch(sketch, settings);
