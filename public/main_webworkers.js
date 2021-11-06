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

async function onready() {
  const reply = await rpc("echo", ["Hello World!"]);
  console.log("Got reply: ", reply);
}

worker.onmessage = function(e) {
  if (e.data.type == "init") {
    onready();
  }
}



