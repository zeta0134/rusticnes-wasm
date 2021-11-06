// ========== Worker Setup and Utility ==========

var worker = new Worker('emu_worker.js');

function rpc(task, args) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({data}) => {
      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    };
    worker.postMessage({"type": "rpc", "func": task, "args": args}, [channel.port2]);
  });
}

worker.onmessage = function(e) {
  if (e.data.type == "init") {
    onready();
  }
}

// ========== Main ==========

async function onready() {
  const reply = await rpc("echo", ["Hello World!"]);
  console.log("Got reply: ", reply);

  // Setup UI events
  document.getElementById('file-loader').addEventListener('change', load_cartridge_by_file, false);
}

// ========== Cartridge Management ==========

let game_checksum = -1;

async function load_cartridge(cart_data) {
  console.log("Attempting to load cart with length: ", cart_data.length);
  await rpc("load_cartridge", [cart_data]);
  console.log("Cart data loaded?");
  //set_audio_samplerate(audio_sample_rate);
  //set_audio_buffersize(audio_buffer_size);
  //console.log("Set sample rate to: ", audio_sample_rate);
  
  //start_time = Date.now();
  //current_frame = 0;
  //game_checksum = crc32(cart_data);
  //load_sram();
  //loaded = true;
  //let power_light = document.querySelector("#power_light #led");
  //power_light.classList.add("powered");
}

function load_cartridge_by_file(e) {
  if (game_checksum != -1) {
    save_sram();
  }
  var file = e.target.files[0];
  if (!file) {
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    cart_data = new Uint8Array(e.target.result);
    load_cartridge(cart_data);
    hide_banners();
  }
  reader.readAsArrayBuffer(file);

  // we're done with the file loader; unfocus it, so keystrokes are captured
  // by the game instead
  this.blur();
}

// ========== User Interface ==========

function hide_banners() {
  banner_elements = document.querySelectorAll(".banner");
  banner_elements.forEach(function(banner) {
    banner.classList.remove("active");
  });
}

