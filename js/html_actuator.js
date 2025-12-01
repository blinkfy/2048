function HTMLActuator() {
  this.tileContainer = document.querySelector(".tile-container");
  this.scoreContainer = document.querySelector(".score-container");
  this.bestContainer = document.querySelector(".best-container");
  this.messageContainer = document.querySelector(".game-message");
  this.score = 0;
} // 与 HTML 元素交互的操作器对象


HTMLActuator.prototype.actuate = function (grid, metadata) {
  var self = this; // 保存 this 指针
  // 确保界面的更新与浏览器的绘制同步，提供更平滑的动画效果
  window.requestAnimationFrame(function () {
    self.clearContainer(self.tileContainer);

    grid.cells.forEach(function (column) {
      column.forEach(function (cell) {
        if (cell) {
          self.addTile(cell);
        }
      });
    });

    self.updateScore(metadata.score);
    self.updateBestScore(metadata.bestScore);

    if (metadata.terminated) {
      if (metadata.over) {
        self.message(false); // You lose
      } else if (metadata.won) {
        self.message(true); // You win!
      }
    }

  });
};

// Continues the game (both restart and keep playing)
HTMLActuator.prototype.continueGame = function () {
  this.clearMessage();
};

// 暂时不知道有什么用，先留着
// 该循环在容器中还有子元素时持续执行，每次循环都会移除最前面的子元素
HTMLActuator.prototype.clearContainer = function (container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

// inner->wrapper->tile 添加到 tileContainer 中 ;使得tile滑动顺畅
HTMLActuator.prototype.addTile = function (tile) {
  var self = this;

  var wrapper = document.createElement("div"); // 创建一个新的 div 元素作为 tile 的容器
  var inner = document.createElement("div"); // 创建一个新的 div 元素作为 tile 的内容
  var position = tile.previousPosition || { x: tile.x, y: tile.y };
  var positionClass = this.positionClass(position);

  // 由于使用 classList 在某些情况下会出现问题（比如在替换类时可能会出现一些奇怪的行为），所以这里选择了另一种方式来处理 CSS 类名。
  var classes = ["tile", "tile-" + tile.value, positionClass];
  // tile 是通用类 ， tile-value 是当前 tile 的值， positionClass 是当前 tile 的位置

  if (tile.value > 2048) classes.push("tile-super");
  
  this.applyClasses(wrapper, classes); // 将类名数组 classes 应用到 wrapper 元素上

  inner.classList.add("tile-inner"); //这行代码使用 classList.add 方法将类名 tile-inner 添加到刚刚创建的 div 元素的 class 属性中。
  inner.textContent = tile.value;
  if (!tile.healthBarContainer) {
    // 创建血条元素
    var healthBarContainer = document.createElement("div");
    healthBarContainer.classList.add("health-bar-container");

    var healthBar = document.createElement("div");
    healthBar.classList.add("health-bar");
    healthBar.style.width = (tile.health / tile.value * 100) + "%"; // 根据血量设置宽度

    healthBarContainer.appendChild(healthBar);
    wrapper.appendChild(healthBarContainer); // 将血条容器添加到 wrapper 中

    tile.healthBarContainer = healthBarContainer;
    tile.healthBar = healthBar;
  } else {
    tile.healthBar.style.width = (tile.health / tile.value * 100) + "%"; // 更新血量条宽度
    wrapper.appendChild(tile.healthBarContainer);
  }

  if (tile.previousPosition) {
    // 确保贴图首先在之前的位置被渲染
    //在简单或不频繁变化的场景中，位置更新的影响可能不明显，但在复杂的场景中，这可能是一个性能瓶颈。
    // 为了解决这个问题，我们可以使用 requestAnimationFrame API 来延迟位置更新，直到浏览器的下一个重绘周期。
    window.requestAnimationFrame(function () {
      classes[2] = self.positionClass({ x: tile.x, y: tile.y }); // Update the position class
      self.applyClasses(wrapper, classes); // Update the position
       wrapper.appendChild(tile.healthBarContainer); // 重新添加血条容器
    }); // requestAnimationFrame 是浏览器提供的一个 API，用于在浏览器的下一个重绘（repaint）周期之前执行一段代码。
    //它通常用于实现平滑的动画，因为它能够在最佳时机更新动画，使得动画的刷新率与浏览器的刷新率同步。
  }
  else if (tile.mergedFrom) {
    classes.push("tile-merged"); // 应用合并动画
    this.applyClasses(wrapper, classes);
    // Render the tiles that merged
    tile.mergedFrom.forEach(function (merged) {
      self.addTile(merged);
    });
  } else {
    classes.push("tile-new"); // 应用新生成动画
    // 安全获取血条容器引用（可能来自新建或已存在）
    var hbRef = tile.healthBarContainer || (typeof healthBarContainer !== 'undefined' ? healthBarContainer : null);
    if (hbRef) {
      hbRef.classList.add("appear");
      // 监听动画结束事件，并在动画结束后移除 appear 类
      hbRef.addEventListener('animationend', function () {
        hbRef.classList.remove("appear");
      }, { once: true });
    }
    this.applyClasses(wrapper, classes);
  }

  // 把inner元素添加到wrapper元素中
  wrapper.appendChild(inner); //子节点添加到父节点中

  // Put the tile on the board
  this.tileContainer.appendChild(wrapper);
};

HTMLActuator.prototype.applyClasses = function (element, classes) {
  element.setAttribute("class", classes.join(" "));
}; // 将类名数组拼接成一个由空格分隔的字符串，之后变成class类，加到element元素上
// 一般是div元素，用于包裹 tile 元素

HTMLActuator.prototype.normalizePosition = function (position) {
  return { x: position.x + 1, y: position.y + 1 };
}; /* 坐标位置的标准化 游戏或界面中的位置坐标可能是从 0 开始的，而在 CSS 中，类名通常需要从 1 开始，
 以避免出现 tile-position-0-0 这样的类名，这样的类名可能不符合预期的格式。*/

HTMLActuator.prototype.positionClass = function (position) {
  position = this.normalizePosition(position);
  return "tile-position-" + position.x + "-" + position.y;
};  // 生成基于 tile 位置的 CSS 类名

HTMLActuator.prototype.updateScore = function (score) {
  this.clearContainer(this.scoreContainer);

  var difference = score - this.score;
  this.score = score;

  this.scoreContainer.textContent = this.score;

  if (difference > 0) {
    var addition = document.createElement("div");
    addition.classList.add("score-addition");
    addition.textContent = "+" + difference;

    this.scoreContainer.appendChild(addition);
  }
};

HTMLActuator.prototype.updateBestScore = function (bestScore) {
  this.bestContainer.textContent = bestScore;
};

HTMLActuator.prototype.message = function (won) {
  var type = won ? "game-won" : "game-over";
  var message = won ? "You win!" : "Game over!";

  this.messageContainer.classList.add(type);
  this.messageContainer.getElementsByTagName("p")[0].textContent = message;
};

HTMLActuator.prototype.clearMessage = function () {
  // IE每次只能清除一个类名，所以需要循环调用 remove 方法
  this.messageContainer.classList.remove("game-won"); // 返回一个元素 class 属性的动态 DOMTokenList 集合，并移除指定的类名。
  this.messageContainer.classList.remove("game-over");
};

HTMLActuator.prototype.updateHealthBar = function (tile) {
  var positionClass = this.positionClass({ x: tile.x, y: tile.y });
  var tileElement = document.querySelector('.' + positionClass + ' .health-bar');
  if (tileElement) {
    tileElement.style.width = (tile.health / tile.value * 100) + "%";
  }
};