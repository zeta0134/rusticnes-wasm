/* tslint:disable */
export function load_rom(arg0: Uint8Array): void;

export function run_until_vblank(): void;

export function get_screen_pixels(): Uint8Array;

export function set_p1_input(arg0: number): void;

export function set_audio_samplerate(arg0: number): void;

export function audio_buffer_full(): boolean;

export function get_audio_buffer(): Int16Array;

