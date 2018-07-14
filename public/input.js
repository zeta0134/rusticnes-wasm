// Note: The following variable is global, and represents our live button state for the emulator:
// var keys = [0,0];

var keys = [0,0];
var remap_key = false;
var remap_index = 0;
var remap_slot = 1;

var controller_keymaps = [];
controller_keymaps[1] = [
"z",
"x",
"Shift",
"Enter",
"ArrowUp",
"ArrowDown",
"ArrowLeft",
"ArrowRight"];

controller_keymaps[2] = [
"-",
"-",
"-",
"-",
"-",
"-",
"-",
"-"];

window.addEventListener('keydown', function(event) {
  if (remap_key) {
    if (event.key != "Escape") {
      controller_keymaps[remap_slot][remap_index] = event.key;
    } else {
      controller_keymaps[remap_slot][remap_index] = "-";
    }
    remap_key = false;
    displayButtonMappings();
    return;
  }
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controller_keymaps[c][i]) {
        keys[c] = keys[c] | (0x1 << i);
      }
    }
  }
});

window.addEventListener('keyup', function(event) {
  for (var c = 1; c <= 2; c++) {
    for (var i = 0; i < 8; i++) {
      if (event.key == controller_keymaps[c][i]) {
        keys[c] = keys[c] & ~(0x1 << i);
      }
    }
  }
});

function displayButtonMappings() {
  var buttons = document.querySelectorAll("#configure_input button");
  buttons.forEach(function(button) {
    var key_index = button.getAttribute("data-key");
    var key_slot = button.getAttribute("data-slot");
    button.innerHTML = controller_keymaps[key_slot][key_index];
    button.classList.remove("remapping");
  });
}

function remapButton() {
  this.classList.add("remapping");
  this.innerHTML = "..."
  remap_key = true;
  remap_index = this.getAttribute("data-key");
  remap_slot = this.getAttribute("data-slot");
  this.blur();
}

function initializeButtonMappings() {
  displayButtonMappings();
  var buttons = document.querySelectorAll("#configure_input button");
  buttons.forEach(function(button) {
    button.addEventListener("click", remapButton);
  });
}