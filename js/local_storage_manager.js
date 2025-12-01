window.fakeStorage = {
  _data: {},

  setItem: function (id, val) {
    return this._data[id] = String(val); // 这个方法将一个值存储到 _data 对象中。id 是键，val 是值。
  },

  getItem: function (id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : undefined; // 返回一个布尔值，表示对象自有属性（而不是继承来的属性）中是否具有指定的属性。
  },

  removeItem: function (id) {
    return delete this._data[id];
  },

  clear: function () {
    return this._data = {};
  }
}; /*这种模式通常用于模拟或仿真浏览器的存储机制，如 localStorage 或 sessionStorage，特别是在测试中或者当这些存储机制不可用或不想使用时。 */

function LocalStorageManager() {
  this.bestScoreKey = "bestScore_z";
  this.gameStateKey = "gameState_z";

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
}

LocalStorageManager.prototype.localStorageSupported = function () {
  var testKey = "test";

  try {
    var storage = window.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
};

// 从本地的localStorage中获取最佳分数，如果没有，则返回0
LocalStorageManager.prototype.getBestScore = function () {
  return this.storage.getItem(this.bestScoreKey) || 0;
};

// 保存最佳分数到本地的localStorage
LocalStorageManager.prototype.setBestScore = function (score) {
  this.storage.setItem(this.bestScoreKey, score);
};

// 从本地的localStorage中获取游戏状态，如果没有，则返回null
LocalStorageManager.prototype.getGameState = function () {
  var stateJSON = this.storage.getItem(this.gameStateKey);
  return stateJSON ? JSON.parse(stateJSON) : null; // JSON.parse() 方法用来解析 JSON 字符串，构造由字符串描述的 JavaScript 值或对象
};

// 保存游戏状态到本地的localStorage
LocalStorageManager.prototype.setGameState = function (gameState) {
  this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));  // JSON.stringify() 方法将一个 JavaScript 对象或值转换为 JSON 字符串
};

// 清除本地的localStorage中保存的游戏状态
LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
};
