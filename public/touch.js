touch_button_elements = []
active_touches = {}

stickiness_radius = 10 // pixels, ish

function register_touch_button(querystring) {
  var button_element = document.querySelector(querystring);
  if (button_element) {
    touch_button_elements.push(button_element);
  } else {
    console.log("Could not find element ", querystring);
  }
}

// Relative to the viewport
function element_centerpoint(element) {
  let rect = element.getBoundingClientRect();
  let cx = rect.left + (rect.width / 2);
  let cy = rect.top + (rect.height / 2);
  return [cx, cy]
}

function element_radius(element) {
  let rect = element.getBoundingClientRect();
  let longest_side = Math.max(rect.width, rect.height)
  return longest_side / 2;
}

function is_inside_element(touch, element) {
  let [cx, cy] = element_centerpoint(element);
  let radius = element_radius(element);
  let tx = touch.clientX;
  let ty = touch.clientY;
  let dx = tx - cx;
  let dy = ty - cy;
  let distance_squared = (dx * dx) + (dy * dy)
  let radius_squared = radius * radius;
  return distance_squared < radius_squared;
}

function is_stuck_to_element(touch, element) {
  // Very similar to is_inside_element, but with the stickiness radius applied
  let [cx, cy] = element_centerpoint(element);
  let radius = element_radius(element) + stickiness_radius;
  let tx = touch.clientX;
  let ty = touch.clientY;
  let dx = tx - cx;
  let dy = ty - cy;
  let distance_squared = (dx * dx) + (dy * dy)
  let radius_squared = radius * radius;
  return distance_squared < radius_squared;
}

function initialize_touch(querystring) {
  var touch_root_element = document.querySelector(querystring);
  touch_root_element.addEventListener('touchstart', handleTouchEvent)
  touch_root_element.addEventListener('touchend', handleTouchEvent)
  touch_root_element.addEventListener('touchmove', handleTouchEvent)
  touch_root_element.addEventListener('touchcancel', handleTouchEvent)
}

function handleTouches(touches) {
  // First, prune any touches that got released, and add (empty) touches for
  // new identifiers
  pruned_touches = {}
  for (let touch of touches) {
    if (active_touches.hasOwnProperty(touch.identifier)) {
      // If this touch is previously tracked, copy that info
      pruned_touches[touch.identifier] = active_touches[touch.identifier];
    } else {
      // Otherwise this is a new touch; initialize it accordingly
      pruned_touches[touch.identifier] = {"region": null};
    }

    if (pruned_touches[touch.identifier].region != null) {
      let button_element = document.getElementById(pruned_touches[touch.identifier].region);
      if (!(is_stuck_to_element(touch, button_element))) {
        pruned_touches[touch.identifier].region = null;
      }
    }

    for (let button_element of touch_button_elements) {
      if (pruned_touches[touch.identifier].region == null) {
        if (is_inside_element(touch, button_element)) {
          pruned_touches[touch.identifier].region = button_element.id;
        }
      }
    }
  }
  // At this point any released touch points should not have been copied to the list,
  // so swapping lists will prune them
  active_touches = pruned_touches;

  process_active_touch_regions();
}

function clear_active_classes() {
  for (let el of touch_button_elements) {
    el.classList.remove("active");
  }
}

function process_active_touch_regions() {
  clear_active_classes();
  for (let touch_identifier in active_touches) {
    active_touch = active_touches[touch_identifier];
    if (active_touch.region != null) {      
      let button_element = document.getElementById(active_touch.region);
      button_element.classList.add("active");
    }
  }
}

function handleTouchEvent(event) {
  event.preventDefault();
  handleTouches(event.touches);
}
