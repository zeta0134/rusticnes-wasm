
                (function() {
                    var wasm;
                    const __exports = {};
                    

let cachedUint8Memory = null;
function getUint8Memory() {
    if (cachedUint8Memory === null ||
        cachedUint8Memory.buffer !== wasm.memory.buffer)
        cachedUint8Memory = new Uint8Array(wasm.memory.buffer);
    return cachedUint8Memory;
}

function passArray8ToWasm(arg) {
    const ptr = wasm.__wbindgen_malloc(arg.length);
    getUint8Memory().set(arg, ptr);
    return [ptr, arg.length];
}

let cachedUint32Memory = null;
function getUint32Memory() {
    if (cachedUint32Memory === null ||
        cachedUint32Memory.buffer !== wasm.memory.buffer)
        cachedUint32Memory = new Uint32Array(wasm.memory.buffer);
    return cachedUint32Memory;
}

let cachedGlobalArgumentPtr = null;
function globalArgumentPtr() {
    if (cachedGlobalArgumentPtr === null)
        cachedGlobalArgumentPtr = wasm.__wbindgen_global_argument_ptr();
    return cachedGlobalArgumentPtr;
}

function setGlobalArgument(arg, i) {
    const idx = globalArgumentPtr() / 4 + i;
    getUint32Memory()[idx] = arg;
}

__exports.load_rom = function(arg0) {
    const [ptr0, len0] = passArray8ToWasm(arg0);
    setGlobalArgument(len0, 0);
    try {
        return wasm.load_rom(ptr0);
    } finally {
        wasm.__wbindgen_free(ptr0, len0 * 1);
    }
}

__exports.run_until_vblank = function() {
    return wasm.run_until_vblank();
}

function getArrayU8FromWasm(ptr, len) {
    const mem = getUint8Memory();
    const slice = mem.slice(ptr, ptr + len);
    return new Uint8Array(slice);
}

function getGlobalArgument(arg) {
    const idx = globalArgumentPtr() / 4 + arg;
    return getUint32Memory()[idx];
}

__exports.get_screen_pixels = function() {
    const ret = wasm.get_screen_pixels();
    const len = getGlobalArgument(0);
    const realRet = getArrayU8FromWasm(ret, len);
    wasm.__wbindgen_free(ret, len * 1);
    return realRet;
}

__exports.set_p1_input = function(arg0) {
    return wasm.set_p1_input(arg0);
}

__exports.set_audio_samplerate = function(arg0) {
    return wasm.set_audio_samplerate(arg0);
}

__exports.audio_buffer_full = function() {
    return (wasm.audio_buffer_full()) !== 0;
}

let cachedUint16Memory = null;
function getUint16Memory() {
    if (cachedUint16Memory === null ||
        cachedUint16Memory.buffer !== wasm.memory.buffer)
        cachedUint16Memory = new Uint16Array(wasm.memory.buffer);
    return cachedUint16Memory;
}

function getArrayI16FromWasm(ptr, len) {
    const mem = getUint16Memory();
    const slice = mem.slice(ptr / 2, ptr / 2 + len);
    return new Int16Array(slice);
}

__exports.get_audio_buffer = function() {
    const ret = wasm.get_audio_buffer();
    const len = getGlobalArgument(0);
    const realRet = getArrayI16FromWasm(ret, len);
    wasm.__wbindgen_free(ret, len * 2);
    return realRet;
}

let slab = [];

let slab_next = 0;

function addHeapObject(obj) {
    if (slab_next === slab.length)
        slab.push(slab.length + 1);
    const idx = slab_next;
    const next = slab[idx];

    slab_next = next;

    slab[idx] = { obj, cnt: 1 };
    return idx << 1;
}

let stack = [];

function getObject(idx) {
    if ((idx & 1) === 1) {
        return stack[idx >> 1];
    } else {
        const val = slab[idx >> 1];

    return val.obj;

    }
}

__exports.__wbindgen_object_clone_ref = function(idx) {
    // If this object is on the stack promote it to the heap.
    if ((idx & 1) === 1)
        return addHeapObject(getObject(idx));

    // Otherwise if the object is on the heap just bump the
    // refcount and move on
    const val = slab[idx >> 1];
    val.cnt += 1;
    return idx;
}

function dropRef(idx) {

    let obj = slab[idx >> 1];

    obj.cnt -= 1;
    if (obj.cnt > 0)
        return;

    // If we hit 0 then free up our space in the slab
    slab[idx >> 1] = slab_next;
    slab_next = idx >> 1;
}

__exports.__wbindgen_object_drop_ref = function(i) { dropRef(i); }

let cachedDecoder = new TextDecoder('utf-8');

function getStringFromWasm(ptr, len) {
    return cachedDecoder.decode(getUint8Memory().slice(ptr, ptr + len));
}

__exports.__wbindgen_string_new = function(p, l) {
    return addHeapObject(getStringFromWasm(p, l));
}

__exports.__wbindgen_number_new = function(i) { return addHeapObject(i); }

__exports.__wbindgen_number_get = function(n, invalid) {
    let obj = getObject(n);
    if (typeof(obj) === 'number')
        return obj;
    getUint8Memory()[invalid] = 1;
    return 0;
}

__exports.__wbindgen_undefined_new = function() { return addHeapObject(undefined); }

__exports.__wbindgen_null_new = function() {
    return addHeapObject(null);
}

__exports.__wbindgen_is_null = function(idx) {
    return getObject(idx) === null ? 1 : 0;
}

__exports.__wbindgen_is_undefined = function(idx) {
    return getObject(idx) === undefined ? 1 : 0;
}

__exports.__wbindgen_boolean_new = function(v) {
    return addHeapObject(v === 1);
}

__exports.__wbindgen_boolean_get = function(i) {
    let v = getObject(i);
    if (typeof(v) === 'boolean') {
        return v ? 1 : 0;
    } else {
        return 2;
    }
}

__exports.__wbindgen_symbol_new = function(ptr, len) {
    let a;
    if (ptr === 0) {
        a = Symbol();
    } else {
        a = Symbol(getStringFromWasm(ptr, len));
    }
    return addHeapObject(a);
}

__exports.__wbindgen_is_symbol = function(i) {
    return typeof(getObject(i)) === 'symbol' ? 1 : 0;
}

let cachedEncoder = new TextEncoder('utf-8');

function passStringToWasm(arg) {

    const buf = cachedEncoder.encode(arg);
    const ptr = wasm.__wbindgen_malloc(buf.length);
    getUint8Memory().set(buf, ptr);
    return [ptr, buf.length];
}

__exports.__wbindgen_string_get = function(i, len_ptr) {
    let obj = getObject(i);
    if (typeof(obj) !== 'string')
        return 0;
    const [ptr, len] = passStringToWasm(obj);
    getUint32Memory()[len_ptr / 4] = len;
    return ptr;
}

__exports.__wbindgen_throw = function(ptr, len) {
    throw new Error(getStringFromWasm(ptr, len));
}

                    function init(wasm_path) {
                        return fetch(wasm_path)
                            .then(response => response.arrayBuffer())
                            .then(buffer => WebAssembly.instantiate(buffer, { './hello_wasm': __exports }))
                            .then(({instance}) => {
                                wasm = init.wasm = instance.exports;
                                return;
                            });
                    };
                    self.wasm_bindgen = Object.assign(init, __exports);
                })();
            