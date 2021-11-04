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
use rusticnes_ui_common::piano_roll_window::PianoRollWindow;

use rusticnes_ui_common::panel::Panel;
use rusticnes_ui_common::drawing::SimpleBuffer;

/* There is no "main" scope, so our application globals need to be actual globals.
   These will be resolved any time a JS event needs to use them; JavaScript will only
   ever process one event in a single thread, but Rust doesn't know that, so we get to
   use Mutexes for no particular reason. */
lazy_static! {
    static ref RUNTIME: Mutex<RuntimeState> = Mutex::new(RuntimeState::new());
    static ref APU_WINDOW: Mutex<ApuWindow> = Mutex::new(ApuWindow::new());
    static ref PIANO_ROLL_WINDOW: Mutex<PianoRollWindow> = Mutex::new(PianoRollWindow::new());

    /* used for blitting the game window */
    static ref CRT_OVERLAY: Mutex<SimpleBuffer> = Mutex::new(SimpleBuffer::from_raw(include_bytes!("assets/overlay.png")));
    static ref GAME_RENDER: Mutex<SimpleBuffer> = Mutex::new(SimpleBuffer::new(256, 240));
}

pub fn dispatch_event(event: Event, runtime: &mut RuntimeState) -> Vec<Event> {
  let mut responses: Vec<Event> = Vec::new();

  let mut apu_window = APU_WINDOW.lock().expect("wat");
  let mut piano_roll_window = PIANO_ROLL_WINDOW.lock().expect("wat");
  
  // windows get an immutable reference to the runtime
  responses.extend(apu_window.handle_event(&runtime, event.clone()));
  responses.extend(piano_roll_window.handle_event(&runtime, event.clone()));

  // ... but RuntimeState needs a mutable reference to itself
  responses.extend(runtime.handle_event(event.clone()));
  
  return responses;
}

pub fn resolve_events(mut events: Vec<Event>, runtime: &mut RuntimeState) {
  while events.len() > 0 {
    let event = events.remove(0);
    let responses = dispatch_event(event, runtime);
    events.extend(responses);
  }
}

#[wasm_bindgen]
pub fn load_rom(cart_data: &[u8]) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let mut events: Vec<Event> = Vec::new();
  let bucket_of_nothing: Vec<u8> = Vec::new();
  let cartridge_data = cart_data.to_vec();
  events.push(Event::LoadCartridge("cartridge".to_string(), Rc::new(cartridge_data), Rc::new(bucket_of_nothing)));
  resolve_events(events, &mut runtime);
}

#[wasm_bindgen]
pub fn run_until_vblank() {
  let mut runtime = RUNTIME.lock().expect("wat");
  while runtime.nes.ppu.current_scanline == 242 {
    let mut events: Vec<Event> = Vec::new();
    events.push(Event::NesRunScanline);
    resolve_events(events, &mut runtime);
  }
  while runtime.nes.ppu.current_scanline != 242 {
    let mut events: Vec<Event> = Vec::new();
    events.push(Event::NesRunScanline);
    resolve_events(events, &mut runtime);
  }
}

#[wasm_bindgen]
pub fn update_windows() {
  let mut runtime = RUNTIME.lock().expect("wat");
  let mut events: Vec<Event> = Vec::new();
  events.push(Event::Update);
  resolve_events(events, &mut runtime);
}

pub fn render_screen_pixels() {
  let runtime = RUNTIME.lock().expect("wat");
  let nes = &runtime.nes;

  let overlay = CRT_OVERLAY.lock().expect("wat");
  let mut render_canvas = GAME_RENDER.lock().expect("wat");
  let pixels = &mut render_canvas.buffer;

  for x in 0 .. 256 {
    for y in 0 .. 240 {
      let palette_index = ((nes.ppu.screen[y * 256 + x]) as usize) * 3;
      let pixel_offset = (y * 256 + x) * 4;
      // overlay with direct buffer reading
      pixels[pixel_offset + 0] = ((NTSC_PAL[palette_index + 0] as u16 * overlay.buffer[pixel_offset + 0] as u16) / 255) as u8;
      pixels[pixel_offset + 1] = ((NTSC_PAL[palette_index + 1] as u16 * overlay.buffer[pixel_offset + 1] as u16) / 255) as u8;
      pixels[pixel_offset + 2] = ((NTSC_PAL[palette_index + 2] as u16 * overlay.buffer[pixel_offset + 2] as u16) / 255) as u8;
      pixels[((y * 256 + x) * 4) + 3] = 255;
    }
  }
}

#[wasm_bindgen]
pub fn draw_screen_pixels(pixels: &mut [u8]) {
  render_screen_pixels();
  let render_canvas = GAME_RENDER.lock().expect("wat");
  pixels.clone_from_slice(&render_canvas.buffer[0..(256*240*4)]);
}

#[wasm_bindgen]
pub fn draw_apu_window(dest: &mut [u8]) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let mut apu_window = APU_WINDOW.lock().expect("wat");
  resolve_events(apu_window.handle_event(&runtime, Event::RequestFrame), &mut runtime);
  dest.clone_from_slice(&apu_window.active_canvas().buffer[0..(256*500*4)]);
}

#[wasm_bindgen]
pub fn draw_piano_roll_window(dest: &mut [u8]) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let mut piano_roll_window = PIANO_ROLL_WINDOW.lock().expect("wat");
  resolve_events(piano_roll_window.handle_event(&runtime, Event::RequestFrame), &mut runtime);
  dest.clone_from_slice(&piano_roll_window.active_canvas().buffer);
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
  
  nes.apu.set_sample_rate(sample_rate as u64);
}

#[wasm_bindgen]
pub fn set_audio_buffersize(buffer_size: u32) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let nes = &mut runtime.nes;
  
  nes.apu.set_buffer_size(buffer_size as usize);
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

#[wasm_bindgen]
pub fn apu_window_click(mx: i32, my: i32) {
  let mut runtime = RUNTIME.lock().expect("wat");
  let mut events: Vec<Event> = Vec::new();
  let mut apu_window = APU_WINDOW.lock().expect("wat");
  events.extend(apu_window.handle_event(&runtime, Event::MouseClick(mx, my)));
  drop(apu_window);
  resolve_events(events, &mut runtime);
}