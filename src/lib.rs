#[macro_use]
extern crate lazy_static;
extern crate rusticnes_core;
extern crate rusticnes_ui_common;
extern crate wasm_bindgen;

use std::sync::Mutex;
use std::rc::Rc;

use rusticnes_core::palettes::NTSC_PAL;
use wasm_bindgen::prelude::*;

use rusticnes_ui_common::application::RuntimeState;
use rusticnes_ui_common::events::Event;
use rusticnes_ui_common::apu_window::ApuWindow;
use rusticnes_ui_common::panel::Panel;

/* There is no "main" scope, so our application globals need to be actual globals.
   These will be resolved any time a JS event needs to use them; JavaScript will only
   ever process one event in a single thread, but Rust doesn't know that, so we get to
   use Mutexes for no particular reason. */
lazy_static! {
    static ref RUNTIME: Mutex<RuntimeState> = Mutex::new(RuntimeState::new());
    static ref APU_WINDOW: Mutex<ApuWindow> = Mutex::new(ApuWindow::new());
}

pub fn dispatch_event(event: Event) -> Vec<Event> {
  let mut responses: Vec<Event> = Vec::new();

  let mut runtime = RUNTIME.lock().expect("wat");
  let mut apu_window = APU_WINDOW.lock().expect("wat");
  
  // windows get an immutable reference to the runtime
  responses.extend(apu_window.handle_event(&runtime, event.clone()));

  // ... but RuntimeState needs a mutable reference to itself
  responses.extend(runtime.handle_event(event.clone()));
  
  return responses;
}

pub fn resolve_events(mut events: Vec<Event>) {
  while events.len() > 0 {
    let event = events.remove(0);
    let responses = dispatch_event(event);
    events.extend(responses);
  }
}

#[wasm_bindgen]
pub fn load_rom(cart_data: &[u8]) {
  let mut events: Vec<Event> = Vec::new();
  let bucket_of_nothing: Vec<u8> = Vec::new();
  let cartridge_data = cart_data.to_vec();
  events.push(Event::LoadCartridge("cartridge".to_string(), Rc::new(cartridge_data), Rc::new(bucket_of_nothing)));
  resolve_events(events);
}

#[wasm_bindgen]
pub fn run_until_vblank() {
  let mut events: Vec<Event> = Vec::new();
  events.push(Event::NesRunFrame);
  resolve_events(events);
}

#[wasm_bindgen]
pub fn update_windows() {
  let mut events: Vec<Event> = Vec::new();
  events.push(Event::Update);
  resolve_events(events);
}

#[wasm_bindgen]
pub fn get_screen_pixels() -> Vec<u8> {
  let runtime = RUNTIME.lock().expect("wat");
  let nes = &runtime.nes;

  let mut pixels = vec![0u8; 256*240*4];
  for x in 0 .. 256 {
    for y in 0 .. 240 {
      let palette_index = ((nes.ppu.screen[y * 256 + x]) as usize) * 3;
      pixels[((y * 256 + x) * 4) + 0] = NTSC_PAL[palette_index + 0];
      pixels[((y * 256 + x) * 4) + 1] = NTSC_PAL[palette_index + 1];
      pixels[((y * 256 + x) * 4) + 2] = NTSC_PAL[palette_index + 2];
      pixels[((y * 256 + x) * 4) + 3] = 255;
    }
  }

  return pixels;
}



#[wasm_bindgen]
pub fn set_p1_input(keystate: u8) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;
  nes.p1_input = keystate;
}

#[wasm_bindgen]
pub fn set_p2_input(keystate: u8) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;
  nes.p2_input = keystate;
}

#[wasm_bindgen]
pub fn set_audio_samplerate(sample_rate: u32) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;
  
  nes.apu.sample_rate = sample_rate as u64;
}

#[wasm_bindgen]
pub fn audio_buffer_full() -> bool {
  let runtime = RUNTIME.lock().expect("wat");
  let nes = &runtime.nes;
  
  return nes.apu.buffer_full;
}

#[wasm_bindgen]
pub fn get_audio_buffer() -> Vec<i16> {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;

  nes.apu.buffer_full = false;
  return nes.apu.output_buffer.to_owned();
}

#[wasm_bindgen]
pub fn get_sram() -> Vec<u8> {
  let runtime = RUNTIME.lock().expect("wat");
  let nes = &runtime.nes;

  return nes.sram().to_owned();
}

#[wasm_bindgen]
pub fn set_sram(sram: Vec<u8>) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;
  
  nes.set_sram(sram);
}

#[wasm_bindgen]
pub fn has_sram() -> bool {
  let runtime = RUNTIME.lock().expect("wat");
  let nes = &runtime.nes;
  
  return nes.mapper.has_sram();
}
