#![feature(proc_macro, wasm_custom_section, wasm_import_module)]

#[macro_use]
extern crate lazy_static;
extern crate rusticnes_core;
extern crate wasm_bindgen;

use std::sync::Mutex;

use rusticnes_core::mmc::none::NoneMapper;
use rusticnes_core::nes::NesState;
use rusticnes_core::palettes::NTSC_PAL;
use wasm_bindgen::prelude::*;

lazy_static! {
    static ref NES: Mutex<NesState> = Mutex::new(NesState::new(Box::new(NoneMapper::new())));
}

#[wasm_bindgen]
pub fn load_rom(cart_data: &[u8]) {
  let maybe_nes = NesState::from_rom(&cart_data);
  match maybe_nes {
    Ok(nes_state) => {
      let mut nes = NES.lock().expect("wat");
      *nes = nes_state;
    },
    Err(why) => {
      println!("{}", why);
    }
  }
}

#[wasm_bindgen]
pub fn run_until_vblank() {
  let mut nes = NES.lock().expect("wat");
  (*nes).run_until_vblank();
}

#[wasm_bindgen]
pub fn get_screen_pixels() -> Vec<u8> {
  let mut pixels = vec![0u8; 256*240*4];
  let nes = NES.lock().expect("wat");
  
  for x in 0 .. 256 {
    for y in 0 .. 240 {
      let palette_index = (((*nes).ppu.screen[y * 256 + x]) as usize) * 3;
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
  let mut nes = NES.lock().expect("wat");
  nes.p1_input = keystate;
}

#[wasm_bindgen]
pub fn set_p2_input(keystate: u8) {
  let mut nes = NES.lock().expect("wat");
  nes.p2_input = keystate;
}

#[wasm_bindgen]
pub fn set_audio_samplerate(sample_rate: u32) {
  let mut nes = NES.lock().expect("wat");
  nes.apu.sample_rate = sample_rate as u64;
}

#[wasm_bindgen]
pub fn audio_buffer_full() -> bool {
  let nes = NES.lock().expect("wat");
  return nes.apu.buffer_full;
}

#[wasm_bindgen]
pub fn get_audio_buffer() -> Vec<i16> {
  let mut nes = NES.lock().expect("wat");
  nes.apu.buffer_full = false;
  return nes.apu.output_buffer.to_owned();
}
