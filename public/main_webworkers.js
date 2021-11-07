// ========== Global Application State ==========

let g_pending_frames = 0;
let g_frames_since_last_fps_count = 0;
let g_rendered_frames = [];

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
    const typed_game_pixels = new Uint8ClampedArray(e.data.image_buffer);
    g_rendered_frames.push(typed_game_pixels);
    g_pending_frames -= 1;
    g_frames_since_last_fps_count += 1;
    if (g_audio_samples_buffered < 8192) {
      g_nes_audio_node.port.postMessage({"type": "samples", "samples": e.data.audio_buffer});
      g_audio_samples_buffered += e.data.audio_buffer.length;
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
  const reply = await rpc("echo", ["Hello World!"]);
  console.log("Got reply: ", reply);

  // Initialize audio context, this will also begin audio playback
  await init_audio_context();

  // Setup UI events
  document.getElementById('file-loader').addEventListener('change', load_cartridge_by_file, false);

  requestAnimationFrame(renderLoop);
  // run the scheduler as often as we can. It will frequently decide not to schedule things, this is fine.
  //window.setInterval(schedule_frames_at_top_speed, 1);
  window.setTimeout(sync_to_audio, 1);
  window.setInterval(compute_fps, 1000);

  // Finally, attempt to load a cartridge by URL, if one is provided
  let params = new URLSearchParams(location.search.slice(1));
  console.log("params", params);
  if (params.get("cartridge")) {
    load_cartridge_by_url(params.get("cartridge"));
    display_banner(params.get("cartridge"));
  }

  window.addEventListener("click", function() {
    // Needed to play audio in certain browsers, notably Chrome, which restricts playback until user action.
    g_audio_context.resume();
  });
}

// ========== Cartridge Management ==========

let game_checksum = -1;

async function load_cartridge(cart_data) {
  console.log("Attempting to load cart with length: ", cart_data.length);
  await rpc("load_cartridge", [cart_data]);
  console.log("Cart data loaded?");
  //set_audio_samplerate(audio_sample_rate);
  //set_audio_buffersize(audio_buffer_size);
  //console.log("Set sample rate to: ", audio_sample_rate);
  
  //start_time = Date.now();
  //current_frame = 0;
  //game_checksum = crc32(cart_data);
  //load_sram();
  //loaded = true;
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
    worker.postMessage({"type": "requestFrame", "p1": keys[1], "p2": keys[2]});
    g_pending_frames += 1;
  }
  window.setTimeout(schedule_frames_at_top_speed, 1);
}

function sync_to_audio() {
  if (g_pending_frames < 10 && g_audio_samples_buffered < 2048) {
    worker.postMessage({"type": "requestFrame", "p1": keys[1], "p2": keys[2]});
    g_pending_frames += 1;
  }
  window.setTimeout(sync_to_audio, 1);
}

// TESTING! Do not actually use this this way, schedule it properly.
async function run_one_frame() {
  canvas = document.querySelector("#pixels");
  await rpc("run_one_frame");
  let image_data = await rpc("get_screen_pixels");
  ctx = canvas.getContext("2d", { alpha: false });
  ctx.putImageData(image_data, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function renderLoop() {
  if (g_rendered_frames.length > 0) {
    let rendered_frame = new ImageData(g_rendered_frames.shift(), 256, 240);
    canvas = document.querySelector("#pixels");
    ctx = canvas.getContext("2d", { alpha: false });
    ctx.putImageData(rendered_frame, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  requestAnimationFrame(renderLoop);
}

// ========== User Interface ==========

function hide_banners() {
  banner_elements = document.querySelectorAll(".banner");
  banner_elements.forEach(function(banner) {
    banner.classList.remove("active");
  });
}

// This runs *around* once per second, ish. It's fine.
function compute_fps() {
  let counter_element = document.querySelector("#fps-counter");
  counter_element.innerText = "FPS: " + g_frames_since_last_fps_count;
  g_frames_since_last_fps_count = 0;
}

