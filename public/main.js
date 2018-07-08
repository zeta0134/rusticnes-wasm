// Note that for webassembly.studio we're using the CLI's `--no-modules` option
// which may not be what you're using locally (aka using ES modules/Webpack).
// Since we're using `--no-modules` the `wasm_bindgen` global is initialized 
// to the exports of our module, and then below initialization is slightly
// different.
//
// When using wasm-bindgen locally and a different bundler like Webpack (or 
// a different option like `--nodejs`) these integration points will be
// tweaked slightly, and you can consult https://github.com/rustwasm/wasm-bindgen
// for more information.

const { load_rom, run_until_vblank, get_screen_pixels, set_p1_input, set_p2_input, set_audio_samplerate, audio_buffer_full, get_audio_buffer } = wasm_bindgen;

var keys = [0,0];
var remap_key = false;
var remap_index = 0;
var remap_slot = 1;

var audio_buffer_size = 4096;
var audio_sample_rate = 44100;
var last_sample = 0;
var nes_audio_buffer = [];
var audio_context;
try {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  audio_context = new AudioContext();
  console.log("Using samplerate: ", audio_context.sampleRate);
  audio_sample_rate = audio_context.sampleRate;
} catch(e) {
  console.log('Web Audio API is not supported in this browser');
}

var script_processor = audio_context.createScriptProcessor(audio_buffer_size, 1, 1);
script_processor.onaudioprocess = function(e) {
  var output = e.outputBuffer.getChannelData(0);
  if (nes_audio_buffer.length >= audio_buffer_size) {
    for (var i = 0; i < audio_buffer_size; i++) {
      // Copy over PCM samples.
      output[i] = nes_audio_buffer[i];
    }
    local_audio_buffer_full = false;
    last_sample = nes_audio_buffer[audio_buffer_size - 1];
    nes_audio_buffer = nes_audio_buffer.slice(audio_buffer_size);
  } else {
    for (var i = 0; i < audio_buffer_size; i++) {
      // Underrun: Copy over the very last sample
      output[i] = last_sample; 
    }
  }
}
script_processor.connect(audio_context.destination);

var controller_keymaps = [];
controller_keymaps[1] = [
"z",
"x",
"Shift",
"Enter",
"ArrowUp",
"ArrowDown",
"ArrowLeft",
"ArrowRight"];

controller_keymaps[2] = [
"-",
"-",
"-",
"-",
"-",
"-",
"-",
"-"];

window.addEventListener('keydown', function(event) {
  if (remap_key) {
    if (event.key != "Escape") {
      controller_keymaps[remap_slot][remap_index] = event.key;
    } else {
      controller_keymaps[remap_slot][remap_index] = "-";
    }
    remap_key = false;
    displayButtonMappings();
    return;
  }
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controller_keymaps[c][i]) {
        keys[c] = keys[c] | (0x1 << i);
      }
    }
  }
});

window.addEventListener('keyup', function(event) {
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controller_keymaps[c][i]) {
        keys[c] = keys[c] & ~(0x1 << i);
      }
    }
  }
});

var start_time = 0;
var current_frame = 0;

function gameLoop() {
  set_p1_input(keys[1]);
  set_p2_input(keys[2]);

  var runtime = Date.now() - start_time;
  var target_frame = runtime / (1000 / 60);
  if (target_frame - current_frame > 2) {
    // We're running behind, reset the timer so we don't run off the deep end
    start_time = Date.now();
    current_frame = 0;
    run_until_vblank();
  } else {
    while (current_frame < target_frame) {
      run_until_vblank();
      current_frame += 1;
    }
  }
  pixels = get_screen_pixels();
  if (audio_buffer_full()) {
    audio_buffer = get_audio_buffer();
    if (nes_audio_buffer.length < audio_buffer_size * 2) { 
      for (i = 0; i < audio_buffer_size; i++) {
        nes_audio_buffer.push(audio_buffer[i] / 32768);
      }
    }
  }

  canvas = document.querySelector('#pixels');
  image_data = new ImageData(new Uint8ClampedArray(pixels), 256, 240);
  ctx = canvas.getContext("2d")
  ctx.putImageData(image_data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  //ctx.drawImage(canvas, 0, 0, 2304, 2160);
  requestAnimationFrame(gameLoop);
}

window.addEventListener("click", function() {
  // Needed to play audio in certain browsers, notably Chrome, which restricts playback until user action.
  audio_context.resume();
});

function load_cartridge_by_url(url) {
  var rawFile = new XMLHttpRequest();
  rawFile.overrideMimeType("application/octet-stream");
  rawFile.open("GET", url, true);
  rawFile.responseType = "arraybuffer";
  rawFile.onreadystatechange = function() {
    if (rawFile.readyState === 4 && rawFile.status == "200") {
      console.log(rawFile.responseType);
      cart_data = new Uint8Array(rawFile.response);
      console.log(cart_data.length);
      load_rom(cart_data);
      console.log("Cart data loaded?");
      set_audio_samplerate(audio_sample_rate);
      console.log("Set sample rate to: ", audio_sample_rate);
      start_time = Date.now();
      current_frame = 0;
      requestAnimationFrame(gameLoop);
    }
  }
  rawFile.send(null);
}

function load_cartridge_by_file(e) {
  var file = e.target.files[0];
  if (!file) {
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    cart_data = new Uint8Array(e.target.result);
    load_rom(cart_data);
    set_audio_samplerate(audio_sample_rate);
    start_time = Date.now();
    current_frame = 0;
    requestAnimationFrame(gameLoop);
  }
  reader.readAsArrayBuffer(file);
}

function clearTabs() {
  var buttons = document.querySelectorAll("#main_menu button");
  buttons.forEach(function(button) {
    button.classList.remove("active");
  });

  var tabs = document.querySelectorAll("div.tab_content");
  tabs.forEach(function(tab) {
    tab.classList.remove("active");
  });
}

function switchToTab() {
  clearTabs();
  this.classList.add("active");
  tab = document.getElementById(this.getAttribute("name"));
  tab.classList.add("active");
}

function displayButtonMappings() {
  var buttons = document.querySelectorAll("#configure_input button");
  buttons.forEach(function(button) {
    var key_index = button.getAttribute("data-key");
    var key_slot = button.getAttribute("data-slot");
    button.innerHTML = controller_keymaps[key_slot][key_index];
    button.classList.remove("remapping");
  });
}

function remapButton() {
  this.classList.add("remapping");
  this.innerHTML = "..."
  remap_key = true;
  remap_index = this.getAttribute("data-key");
  remap_slot = this.getAttribute("data-slot");
  this.blur();
}

function initializeButtonMappings() {
  displayButtonMappings();
  var buttons = document.querySelectorAll("#configure_input button");
  buttons.forEach(function(button) {
    button.addEventListener("click", remapButton);
  });
}

function enterFullscreen() {
  if (this.requestFullscreen) {
    this.requestFullscreen();
  } else if (this.mozRequestFullScreen) {
    this.mozRequestFullScreen();
  } else if (this.webkitRequestFullscreen) {
    this.webkitRequestFullscreen();
  }
}

function handleFullscreenSwitch() {
  if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
    console.log("Entering fullscreen...");
    // Entering fullscreen
    var viewport = document.querySelector("#playfield");
    viewport.classList.add("fullscreen");

    setTimeout(function() {
      var viewport = document.querySelector("#playfield");

      var viewport_width = viewport.clientWidth;
      var viewport_height = viewport.clientHeight;

      var canvas_container = document.querySelector("#playfield div.canvas_container");
      if ((viewport_width / 256) * 240 > viewport_height) {
        var target_height = viewport_height;
        var target_width = target_height / 240 * 256;
        canvas_container.style.width = target_width + "px";
        canvas_container.style.height = target_height + "px";
      } else {
        var target_width = viewport_width;
        var target_height = target_width / 256 * 240;
        canvas_container.style.width = target_width + "px";
        canvas_container.style.height = target_height + "px";
      }
    }, 100);
  } else {
    // Exiting fullscreen
    console.log("Exiting fullscreen...");
    var viewport = document.querySelector("#playfield");
    var canvas_container = document.querySelector("#playfield div.canvas_container");
    viewport.classList.remove("fullscreen");
    canvas_container.style.width = "768px";
    canvas_container.style.height = "720px";
  }
}

function runApp() {
  let params = new URLSearchParams(location.search.slice(1));
  console.log("params", params);
  if (params.get("cartridge")) {
    load_cartridge_by_url(params.get("cartridge"));
  }
  document.getElementById('file-loader').addEventListener('change', load_cartridge_by_file, false);
  
  var buttons = document.querySelectorAll("#main_menu button");
  buttons.forEach(function(button) {
    button.addEventListener("click", switchToTab);
  });

  initializeButtonMappings();

  document.querySelector("#playfield").addEventListener("dblclick", enterFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenSwitch);
  document.addEventListener("webkitfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("mozfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("MSFullscreenChange", handleFullscreenSwitch);
}

// Load and instantiate the wasm file, and we specify the source of the wasm
// file here. Once the returned promise is resolved we're ready to go and
// use our imports.
wasm_bindgen('./rusticnes_wasm_bg.wasm').then(runApp);