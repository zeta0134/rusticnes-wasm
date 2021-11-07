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

function echo(msg) {
  return "Echo: " + msg;
}

function get_screen_pixels() {
  let raw_buffer = new ArrayBuffer(256*240*4);
  let screen_pixels = new Uint8ClampedArray(raw_buffer);
  draw_screen_pixels(screen_pixels);
  return raw_buffer;
}

const rpc_functions = {
  "echo": echo,
  "load_cartridge": load_cartridge,
  "run_one_frame": run_one_frame,
  "get_screen_pixels": get_screen_pixels,
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
    run_one_frame();
    let image_buffer = get_screen_pixels();
    // TODO: this isn't an ArrayBuffer, but it probably should be
    let audio_buffer = consume_audio_samples();
    postMessage({"type": "deliverFrame", "image_buffer": image_buffer, "audio_buffer": audio_buffer}, [image_buffer]);
  }
}

worker_init = function() {
  // We are ready to go! Tell the main thread it can kick off execution
  initialized = true;
  postMessage({"type": "init"});
  self.onmessage = handle_message;
}

wasm_bindgen('./rusticnes_wasm_bg.wasm').then(worker_init);

