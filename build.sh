#!/bin/bash

cargo +nightly build --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/rusticnes_wasm.wasm --out-dir . --no-modules
