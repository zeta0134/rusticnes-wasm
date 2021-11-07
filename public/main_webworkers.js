// ========== Global Application State ==========

let g_pending_frames = 0;
let g_frames_since_last_fps_count = 0;
let g_rendered_frames = [];

let g_last_frame_sample_count = 44100 / 60; // Close-ish enough
let g_audio_samples_buffered = 0;


// ========== Worker Setup and Utility ==========

var worker = new Worker('emu_worker.js');

function rpc(task, args) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({data}) => {
      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    };
    worker.postMessage({"type": "rpc", "func": task, "args": args}, [channel.port2]);
  });
}

worker.onmessage = function(e) {
  if (e.data.type == "init") {
    onready();
  }
  if (e.data.type == "deliverFrame") {
    g_rendered_frames.push(e.data.panels);
    g_pending_frames -= 1;
    g_frames_since_last_fps_count += 1;
    if (g_audio_samples_buffered < 8192) {
      g_nes_audio_node.port.postMessage({"type": "samples", "samples": e.data.audio_buffer});
      g_audio_samples_buffered += e.data.audio_buffer.length;
      g_last_frame_sample_count = e.data.audio_buffer.length;
    } else {
      // Audio overrun, we're running too fast! Drop these samples on the floor and bail.
      // (This can happen in fastforward mode.)
    }
    if (g_rendered_frames.length > 3) {
      // Frame rendering running behing, dropping one frame
      g_rendered_frames.shift(); // and throw it away
    }
  }
}

// ========== Audio Setup ==========

let g_audio_context = null;
let g_nes_audio_node = null;

async function init_audio_context() {
  g_audio_context = new AudioContext({
    latencyHint: 'interactive',
    sampleRate: 44100,
  });
  await g_audio_context.audioWorklet.addModule('audio_processor.js');
  g_nes_audio_node = new AudioWorkletNode(g_audio_context, 'nes-audio-processor');
  g_nes_audio_node.connect(g_audio_context.destination);
  g_nes_audio_node.port.onmessage = handle_audio_message;
}

function handle_audio_message(e) {
  if (e.data.type == "samplesPlayed") {
    g_audio_samples_buffered -= e.data.count;
  }
}

// ========== Main ==========

async function onready() {
  // Initialize audio context, this will also begin audio playback
  await init_audio_context();

  // Initialize everything else
  init_ui_events();
  initializeButtonMappings();

  // Kick off the events that will drive emulation
  requestAnimationFrame(renderLoop);
  // run the scheduler as often as we can. It will frequently decide not to schedule things, this is fine.
  //window.setInterval(schedule_frames_at_top_speed, 1);
  window.setTimeout(sync_to_audio, 1);
  window.setInterval(compute_fps, 1000);

  // Attempt to load a cartridge by URL, if one is provided
  let params = new URLSearchParams(location.search.slice(1));
  if (params.get("cartridge")) {
    load_cartridge_by_url(params.get("cartridge"));
    display_banner(params.get("cartridge"));
  }
  if (params.get("tab")) {
    switchToTab(params.get("tab"));
  }
}

function init_ui_events() {
  // Setup UI events
  document.getElementById('file-loader').addEventListener('change', load_cartridge_by_file, false);

  var buttons = document.querySelectorAll("#main_menu button");
  buttons.forEach(function(button) {
    button.addEventListener("click", clickTab);
  });

  window.addEventListener("click", function() {
    // Needed to play audio in certain browsers, notably Chrome, which restricts playback until user action.
    g_audio_context.resume();
  });

  document.querySelector("#playfield").addEventListener("dblclick", enterFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenSwitch);
  document.addEventListener("webkitfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("mozfullscreenchange", handleFullscreenSwitch);
  document.addEventListener("MSFullscreenChange", handleFullscreenSwitch);
}

// ========== Cartridge Management ==========

let game_checksum = -1;

async function load_cartridge(cart_data) {
  console.log("Attempting to load cart with length: ", cart_data.length);
  await rpc("load_cartridge", [cart_data]);
  console.log("Cart data loaded?");
  
  //game_checksum = crc32(cart_data);
  //load_sram();
  //let power_light = document.querySelector("#power_light #led");
  //power_light.classList.add("powered");
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

// ========== Emulator Runtime ==========

function schedule_frames_at_top_speed() {
  if (g_pending_frames < 10) {
    requestFrame();
  }
  window.setTimeout(schedule_frames_at_top_speed, 1);
}

function sync_to_audio() {
  // Never, for any reason, request more than 10 frames at a time. This prevents
  // the message queue from getting flooded if the emulator can't keep up.
  if (g_pending_frames < 10) {
    const actual_samples = g_audio_samples_buffered;
    const pending_samples = g_pending_frames * g_last_frame_sample_count;
    const sample_threshold = 2048;
    if (actual_samples + pending_samples < sample_threshold) {
      requestFrame();
    }
  }
  window.setTimeout(sync_to_audio, 1);
}

function requestFrame() {  
  let active_tab = document.querySelector(".tab_content.active").id;
  if (active_tab == "jam") {
    worker.postMessage({"type": "requestFrame", "p1": keys[1], "p2": keys[2], "panels": [
      {"id": "screen", "target_element": "#jam_pixels"},
      {"id": "apu_window", "target_element": "#apu_window"},
      {"id": "piano_roll_window", "target_element": "#piano_roll_window"},
    ]});
  } else {
    worker.postMessage({"type": "requestFrame", "p1": keys[1], "p2": keys[2], "panels": [
      {"id": "screen", "target_element": "#pixels"}
    ]});
  }
  g_pending_frames += 1;
}

function renderLoop() {
  if (g_rendered_frames.length > 0) {
    for (let panel of g_rendered_frames.shift()) {
      const typed_pixels = new Uint8ClampedArray(panel.image_buffer);
      // TODO: don't hard-code the panel size here
      let rendered_frame = new ImageData(typed_pixels, panel.width, panel.height);
      canvas = document.querySelector(panel.target_element);
      ctx = canvas.getContext("2d", { alpha: false });
      ctx.putImageData(rendered_frame, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
  }

  requestAnimationFrame(renderLoop);
}

// ========== User Interface ==========

// This runs *around* once per second, ish. It's fine.
function compute_fps() {
  let counter_element = document.querySelector("#fps-counter");
  counter_element.innerText = "FPS: " + g_frames_since_last_fps_count;
  g_frames_since_last_fps_count = 0;
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