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

const { 
  load_rom, 
  run_until_vblank,   
  set_p1_input, 
  set_p2_input, 
  set_audio_samplerate, 
  audio_buffer_full, 
  get_audio_buffer, 
  get_sram, set_sram, 
  has_sram, update_windows, 
  draw_apu_window, 
  draw_piano_roll_window,
  draw_screen_pixels,
  apu_window_click
} = wasm_bindgen;

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

// CRC32 checksum generating functions, yanked from this handy stackoverflow post and modified to work with arrays:
// https://stackoverflow.com/questions/18638900/javascript-crc32
// Used to identify .nes files semi-uniquely, for the purpose of saving SRAM
var makeCRCTable = function(){
    var c;
    var crcTable = [];
    for(var n =0; n < 256; n++){
        c = n;
        for(var k =0; k < 8; k++){
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

var crc32 = function(byte_array) {
    var crcTable = window.crcTable || (window.crcTable = makeCRCTable());
    var crc = 0 ^ (-1);

    for (var i = 0; i < byte_array.length; i++ ) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte_array[i]) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
};

var game_checksum = -1;

function load_sram() {
  if (has_sram()) {
    try {
      var sram_str = window.localStorage.getItem(game_checksum);
      if (sram_str) {
        var sram = JSON.parse(sram_str);
        set_sram(sram);        
        console.log("SRAM Loaded!", game_checksum);
      }
    } catch(e) {
      console.log("Local Storage is probably unavailable! SRAM saving and loading will not work.");
    }
  }
}

function save_sram() {
  if (has_sram()) {
    try {
      var sram_uint8 = get_sram();
      // Make it a normal array
      var sram = [];
      for (var i = 0; i < sram_uint8.length; i++) {
        sram[i] = sram_uint8[i];
      }
      window.localStorage.setItem(game_checksum, JSON.stringify(sram));
      console.log("SRAM Saved!", game_checksum);
    } catch(e) {
      console.log("Local Storage is probably unavailable! SRAM saving and loading will not work.");
    }
  }
}

var start_time = 0;
var current_frame = 0;
var sram_delay = 600;

var screen_pixels = new Uint8ClampedArray(256*240*4);
var apu_raw_pixels = new Uint8ClampedArray(256*500*4);
var piano_roll_raw_pixels = new Uint8ClampedArray(256*240*4);

function draw_window(id, pixel_array, rust_draw_func, width, height) {
  canvas = document.querySelector(id);
  rust_draw_func(pixel_array);
  image_data = new ImageData(pixel_array, width, height);
  ctx = canvas.getContext("2d", { alpha: false });
  ctx.putImageData(image_data, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

var loaded = false;

function gameLoop() {
  if (!loaded) {
    return;
  }
  updateGamepads();
  set_p1_input(keys[1]);
  set_p2_input(keys[2]);

  var runtime = Date.now() - start_time;
  var target_frame = runtime / (1000 / 60);
  if (target_frame - current_frame > 2) {
    // We're running behind, reset the timer so we don't run off the deep end
    start_time = Date.now();
    current_frame = 0;
    run_until_vblank();
    update_windows()
  } else {
    while (current_frame < target_frame) {
      run_until_vblank();
      update_windows()
      current_frame += 1;
    }
  }
  if (audio_buffer_full()) {
    audio_buffer = get_audio_buffer();
    if (nes_audio_buffer.length < audio_buffer_size * 2) { 
      for (i = 0; i < audio_buffer_size; i++) {
        nes_audio_buffer.push(audio_buffer[i] / 32768);
      }
    }
  }

  sram_delay = sram_delay - 1;
  if (sram_delay <= 0) {
    save_sram();
    sram_delay = 600;
  }
}

function renderLoop() {
  // Draw all windows
  let active_tab = document.querySelector(".tab_content.active").id;
  if (active_tab == "jam") {
    draw_window("#jam_pixels", screen_pixels, draw_screen_pixels, 256, 240);
    draw_window("#apu_window", apu_raw_pixels, draw_apu_window, 256, 500);
    draw_window("#piano_roll_window", piano_roll_raw_pixels, draw_piano_roll_window, 256, 240);
  } else {
    draw_window("#pixels", screen_pixels, draw_screen_pixels, 256, 240);
  }

  requestAnimationFrame(renderLoop);
}

window.addEventListener("click", function() {
  // Needed to play audio in certain browsers, notably Chrome, which restricts playback until user action.
  audio_context.resume();
});

function load_cartridge(cart_data) {
  console.log(cart_data.length);
  load_rom(cart_data);
  console.log("Cart data loaded?");
  set_audio_samplerate(audio_sample_rate);
  console.log("Set sample rate to: ", audio_sample_rate);
  start_time = Date.now();
  current_frame = 0;
  game_checksum = crc32(cart_data);
  load_sram();
  loaded = true;
  let power_light = document.querySelector("#power_light #led");
  power_light.classList.add("powered");
}

function load_cartridge_by_url(url) {
  if (game_checksum != -1) {
    save_sram();
  }
  var rawFile = new XMLHttpRequest();
  rawFile.overrideMimeType("application/octet-stream");
  rawFile.open("GET", url, true);
  rawFile.responseType = "arraybuffer";
  rawFile.onreadystatechange = function() {
    if (rawFile.readyState === 4 && rawFile.status == "200") {
      console.log(rawFile.responseType);
      cart_data = new Uint8Array(rawFile.response);
      load_cartridge(cart_data);
    }
  }
  rawFile.send(null);
}

function load_cartridge_by_file(e) {
  if (game_checksum != -1) {
    save_sram();
  }
  var file = e.target.files[0];
  if (!file) {
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    cart_data = new Uint8Array(e.target.result);
    load_cartridge(cart_data);
    hide_banners();
  }
  reader.readAsArrayBuffer(file);

  // we're done with the file loader; unfocus it, so keystrokes are captured
  // by the game instead
  this.blur();
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

function switchToTab(tab_name) {
  tab_elements = document.getElementsByName(tab_name);
  if (tab_elements.length == 1)  {
    clearTabs();
    tab_elements[0].classList.add("active");
    content_element = document.getElementById(tab_name);
    content_element.classList.add("active");
  }
}

function clickTab() {
  switchToTab(this.getAttribute("name")); 
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
    canvas_container.style.width = "";
    canvas_container.style.height = "";
  }
}

function hide_banners() {
  banner_elements = document.querySelectorAll(".banner");
  banner_elements.forEach(function(banner) {
    banner.classList.remove("active");
  });
}

function display_banner(cartridge_name) {
  hide_banners();
  banner_elements = document.getElementsByName(cartridge_name);
  if (banner_elements.length == 1)  {
    banner_elements[0].classList.add("active");
  }
}

function handle_apu_window_click(e) {  
  apu_window_click(e.offsetX, e.offsetY);
}

function runApp() {
  let params = new URLSearchParams(location.search.slice(1));
  console.log("params", params);
  if (params.get("cartridge")) {
    load_cartridge_by_url(params.get("cartridge"));
    display_banner(params.get("cartridge"));
  }
  if (params.get("tab")) {
    switchToTab(params.get("tab"));
  }
  document.getElementById('file-loader').addEventListener('change', load_cartridge_by_file, false);
  
  var buttons = document.querySelectorAll("#main_menu button");
  buttons.forEach(function(button) {
    button.addEventListener("click", clickTab);
  });

  initializeButtonMappings();

  document.querySelector("#playfield").addEventListener("dblclick", enterFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenSwitch);
  document.addEventListener("webkitfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("mozfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("MSFullscreenChange", handleFullscreenSwitch);

  document.querySelector("#apu_window").addEventListener("click", handle_apu_window_click);

  loadInputConfig();
  requestAnimationFrame(renderLoop);
  window.setInterval(gameLoop, 15);
}

// Load and instantiate the wasm file, and we specify the source of the wasm
// file here. Once the returned promise is resolved we're ready to go and
// use our imports.
wasm_bindgen('./rusticnes_wasm_bg.wasm').then(runApp);
