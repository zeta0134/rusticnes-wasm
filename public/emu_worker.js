importScripts('./rusticnes_wasm.js');

const { 
  load_rom, 
  run_until_vblank,   
  set_p1_input, 
  set_p2_input, 
  set_audio_samplerate,
  set_audio_buffersize,
  audio_buffer_full, 
  get_audio_buffer, 
  get_sram, set_sram, 
  has_sram, update_windows, 
  draw_apu_window, 
  draw_piano_roll_window,
  draw_screen_pixels,
  apu_window_click,
  consume_audio_samples,
} = wasm_bindgen;

let initialized = false;

// TODO: The rust side of this *should* be generating appropriate error
// messages. Can we catch those and propogate that error to the UI? That
// would be excellent for users, right now they're just getting silent
// failure.
function load_cartridge(cart_data) {
  load_rom(cart_data);
  //set_audio_samplerate(audio_sample_rate);
  //set_audio_buffersize(audio_buffer_size);
}

function run_one_frame() {
  run_until_vblank();
  update_windows();
}

function get_screen_pixels() {
  let raw_buffer = new ArrayBuffer(256*240*4);
  let screen_pixels = new Uint8ClampedArray(raw_buffer);
  draw_screen_pixels(screen_pixels);
  return raw_buffer;
}

function get_apu_pixels() {
  let raw_buffer = new ArrayBuffer(256*500*4);
  let screen_pixels = new Uint8ClampedArray(raw_buffer);
  draw_apu_window(screen_pixels);
  return raw_buffer;
}

function get_piano_roll_pixels() {
  let raw_buffer = new ArrayBuffer(480*270*4);
  let screen_pixels = new Uint8ClampedArray(raw_buffer);
  draw_piano_roll_window(screen_pixels);
  return raw_buffer;
}

function handle_apu_window_click(mx, my) {  
  apu_window_click(mx, my);
}

const rpc_functions = {
  "load_cartridge": load_cartridge,
  "run_one_frame": run_one_frame,
  "get_screen_pixels": get_screen_pixels,
  "get_apu_pixels": get_apu_pixels,
  "get_piano_roll_pixels": get_piano_roll_pixels,
  "handle_apu_window_click": handle_apu_window_click,
};

function rpc(task, args, reply_channel) {
  if (rpc_functions.hasOwnProperty(task)) {
    const result = rpc_functions[task].apply(this, args);
    reply_channel.postMessage({"result": result});
  }
}

function handle_message(e) {
  if (e.data.type == "rpc") {
    rpc(e.data.func, e.data.args, e.ports[0])
  }
  if (e.data.type == "requestFrame") {
    set_p1_input(e.data.p1);
    set_p2_input(e.data.p2);
    run_one_frame();

    let outputPanels = [];
    let transferrableBuffers = [];
    for (let panel of e.data.panels) {
      if (panel.id == "screen") {
        let image_buffer = get_screen_pixels();
        outputPanels.push({
          target_element: panel.target_element,
          image_buffer: image_buffer,
          width: 256,
          height: 240
        });
        transferrableBuffers.push(image_buffer);
      }
      if (panel.id == "apu_window") {
        let image_buffer = get_apu_pixels();
        outputPanels.push({
          target_element: panel.target_element,
          image_buffer: image_buffer,
          width: 256,
          height: 500
        });
        transferrableBuffers.push(image_buffer);
      }
      if (panel.id == "piano_roll_window") {
        let image_buffer = get_piano_roll_pixels();
        outputPanels.push({
          target_element: panel.target_element,
          image_buffer: image_buffer,
          width: 480,
          height: 270
        });
        transferrableBuffers.push(image_buffer);
      }
    }
    // TODO: this isn't an ArrayBuffer. It probably should be?
    let audio_buffer = consume_audio_samples();
    postMessage({"type": "deliverFrame", "panels": outputPanels, "audio_buffer": audio_buffer}, transferrableBuffers);
  }
}

worker_init = function() {
  // We are ready to go! Tell the main thread it can kick off execution
  initialized = true;
  postMessage({"type": "init"});
  self.onmessage = handle_message;
}

wasm_bindgen('./rusticnes_wasm_bg.wasm').then(worker_init);

