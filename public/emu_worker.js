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
  apu_window_click
} = wasm_bindgen;

let initialized = false;

function load_cartridge(cart_data) {
  load_rom(cart_data);
  //set_audio_samplerate(audio_sample_rate);
  //set_audio_buffersize(audio_buffer_size);
}

function echo(msg) {
  return "Echo: " + msg;
}

const rpc_functions = {
  "echo": echo,
  "load_cartridge": load_cartridge,
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
}

worker_init = function() {
  // We are ready to go! Tell the main thread it can kick off execution
  initialized = true;
  postMessage({"type": "init"});
  self.onmessage = handle_message;
}

wasm_bindgen('./rusticnes_wasm_bg.wasm').then(worker_init);

