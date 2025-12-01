function KeyboardInputManager() {
  this.events = {};
  this.eventTouchstart = "touchstart";
  this.eventTouchmove = "touchmove";
  this.eventTouchend = "touchend";
  this.listen(); // 在构造函数中调用 listen 方法
}

// 注册回调函数
KeyboardInputManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = []; // 这里的events是对象字面量，event是对应的键名，而不是数组
  } // 检查 this.events 对象中是否已经有指定事件的数组。如果没有，则创建一个新的空数组。
  this.events[event].push(callback);
}; // 这里的 callback 是作为参数传递给 on 方法的函数


// 触发回调函数
KeyboardInputManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) { // forEach() 方法对数组的每个元素执行一次给定的函数
      callback(data);
    });
  }
};

KeyboardInputManager.prototype.listen = function () {
  var self = this;

  var map = {
    // 更改了键值对，原来用的event.which,出于兼容性的考虑，这里改成event.key
    "ArrowUp": 0,    // Up (Arrow key)
    "ArrowRight": 1, // Right (Arrow key)
    "ArrowDown": 2,  // Down (Arrow key)
    "ArrowLeft": 3,  // Left (Arrow key)
    "k": 0,          // Vim up (K key)
    "l": 1,          // Vim right (L key)
    "j": 2,          // Vim down (J key)
    "h": 3,          // Vim left (H key)
    "w": 0,          // W key
    "d": 1,          // D key
    "s": 2,          // S key
    "a": 3           // A key

  };

  // 执行函数
  document.addEventListener("keydown", function (event) {
    var modifiers = event.altKey || event.ctrlKey || event.metaKey ||
      event.shiftKey; // event.altKey：如果按下了 Alt 键，则为 true，否则为 false。
    var mapped = map[event.key]; // 原来用的event.which,出于兼容性的考虑，这里改成event.key

    if (!modifiers) {
      if (mapped !== undefined) {
        // 如果游戏暂停，阻止移动
        if (window.gamePaused) {
          event.preventDefault();
          return;
        }
        event.preventDefault(); // 阻止默认事件 (例如：浏览器的默认行为，如滚动页面)
        self.emit("move", mapped);
      }
    }

    // R key restarts the game
    if (!modifiers && event.key === 'r') {
      self.restart.call(self, event);
    }

    // Space key toggles pause (空格键暂停/恢复)
    if (!modifiers && (event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      if (typeof togglePause === 'function') {
        togglePause();
      }
    }
  });

  // 按下按钮后的反应，调用回调函数
  this.bindButtonPress(".retry-button", this.restart);
  this.bindButtonPress(".restart-button", this.restart);
  this.bindButtonPress(".keep-playing-button", this.keepPlaying);

  // 以下是触摸操作
   var touchStartClientX, touchStartClientY;
   var gameContainer = document.getElementsByClassName("game-container")[0];
 
   gameContainer.addEventListener(this.eventTouchstart, function (event) {
     if ((!window.navigator.msPointerEnabled && event.touches.length > 1) ||
         event.targetTouches.length > 1) {
       return; // Ignore if touching with more than 1 finger
     }
 
     if (window.navigator.msPointerEnabled) {
       touchStartClientX = event.pageX;
       touchStartClientY = event.pageY;
     } else {
       touchStartClientX = event.touches[0].clientX;
       touchStartClientY = event.touches[0].clientY;
     }
 
     event.preventDefault();
   });
 
   gameContainer.addEventListener(this.eventTouchmove, function (event) {
     event.preventDefault();
   });
 
   gameContainer.addEventListener(this.eventTouchend, function (event) {
     if ((!window.navigator.msPointerEnabled && event.touches.length > 0) ||
         event.targetTouches.length > 0) {
       return; // Ignore if still touching with one or more fingers
     }
 
     var touchEndClientX, touchEndClientY;
 
     if (window.navigator.msPointerEnabled) {
       touchEndClientX = event.pageX;
       touchEndClientY = event.pageY;
     } else {
       touchEndClientX = event.changedTouches[0].clientX;
       touchEndClientY = event.changedTouches[0].clientY;
     }
 
     var dx = touchEndClientX - touchStartClientX;
     var absDx = Math.abs(dx);
 
     var dy = touchEndClientY - touchStartClientY;
     var absDy = Math.abs(dy);
 
     if (Math.max(absDx, absDy) > 10) {
       // 如果游戏暂停，阻止移动
       if (window.gamePaused) {
         return;
       }
       // (right : left) : (down : up)
       self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
     }
   });
};

KeyboardInputManager.prototype.restart = function (event) {
  const audio = new Audio('./audio/tap.mp3');
  audio.play();
  event.preventDefault();
  this.emit("restart");
  
};

KeyboardInputManager.prototype.keepPlaying = function (event) {
  event.preventDefault();
  this.emit("keepPlaying");
};

KeyboardInputManager.prototype.bindButtonPress = function (selector, fn) {
  var button = document.querySelector(selector);
  button.addEventListener("click", fn.bind(this)); // 点击事件触发回调函数
  button.addEventListener(this.eventTouchend, fn.bind(this)); // 触摸事件也要触发回调函数
};
