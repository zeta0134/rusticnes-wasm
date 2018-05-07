#!/bin/bash

wasm-bindgen target/wasm32-unknown-unknown/release/hello_wasm.wasm --out-dir . --no-modules
cargo +nightly build --target wasm32-unknown-unknown --release
