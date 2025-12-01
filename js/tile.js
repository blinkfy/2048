function Tile(position, value) {
  this.x = position.x;
  this.y = position.y;
  this.value = value || 2;
  this.health = value || 2; // 初始化健康值
  this.previousPosition = null;
  this.mergedFrom = null; // 跟踪合并在一起的 tile
}

// previousPosition 是键值对数据类型
Tile.prototype.savePosition = function () {
  this.previousPosition = { x: this.x, y: this.y };
}; // 通过 prototype 使得所有实例可以共享这些方法和属性。

Tile.prototype.updatePosition = function (position) {
  this.x = position.x;
  this.y = position.y;
}; // 更新位置

// 返回一个对象，包含了当前 tile 的位置和值
Tile.prototype.serialize = function () {
  return {
    position: {
      x: this.x,
      y: this.y
    },
    value: this.value,
    health: this.health // 添加血量到序列化对象中
  };
}; // 序列化
