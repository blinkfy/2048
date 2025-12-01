function Grid(size, previousState) {
  this.size = size;
  this.cells = previousState ? this.fromState(previousState) : this.empty();
}


Grid.prototype.empty = function () {
  var cells = [];

  for (var x = 0; x < this.size; x++) {
    var row = cells[x] = []; // cells 是一个二维数组，每一行是一个数组

    for (var y = 0; y < this.size; y++) {
      row.push(null); // 数组中每一个元素都是 null 
      // 在JavaScript中，数组是通过引用传递的，引用传递意味着对row的修改会直接影响到所有引用该对象的变量,如cells[x]
    }
  }

  return cells;
}; //创建一个空的 size x size 网格，其中每个单元格的值都是 null

Grid.prototype.fromState = function (state) {
  var cells = [];

  for (var x = 0; x < this.size; x++) {
    var row = cells[x] = [];

    for (var y = 0; y < this.size; y++) {
      var tile = state[x][y];
      if (tile) {
        var t = new Tile(tile.position, tile.value);
        // 恢复血量，若缺失则回退为 value
        if (typeof tile.health === 'number') {
          t.health = tile.health;
        } else {
          t.health = tile.value;
        }
        row.push(t);
      } else {
        row.push(null);
      }
    }
  }

  return cells;
}; //根据给定的 state 创建一个 size x size 的网格，其中每个单元格的值都是 Tile 对象/ null

// 随机选取第一个空白单元格
Grid.prototype.randomAvailableCell = function () {
  var cells = this.availableCells();

  if (cells.length) {
    return cells[Math.floor(Math.random() * cells.length)];
  }
};

Grid.prototype.availableCells = function () {
  var cells = [];

  this.eachCell(function (x, y, tile) {
    if (!tile) {
      cells.push({ x: x, y: y }); // cells 先从(0,0)到(0,3),然后依次(1,0)到(1,3),...
    }
  }); // 遍历网格，将空单元格的坐标添加到 cells 数组中
  // cells是一维数组，里面存储着
  // 如果想访问cells数组里的元素，可以用cells[i].x(这是具体某个)，也可以是cells.forEach(),这里用forEach()方法遍历cells数组，在这个括号内，遍历一次cells数组,可以使用函数调用cell

  return cells;
};

// 遍历网格，执行回调函数
Grid.prototype.eachCell = function (callback) {
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      callback(x, y, this.cells[x][y]);
    }
  }
};

// 检查是否还有空白单元格
Grid.prototype.cellsAvailable = function () {
  return !!this.availableCells().length; // 显式布尔转换：通过 !! 可以确保返回值是布尔类型，而不是其他类型（如数字、字符串、对象等）。
};

// 检查单元格是否可用，可用对应False
Grid.prototype.cellAvailable = function (cell) {
  return !this.cellOccupied(cell); // 占用,不可用(False)
};

// 检查单元格是否被占用 占用对应True
Grid.prototype.cellOccupied = function (cell) {
  return !!this.cellContent(cell); // 有数字，占用(True)
};

// 获取指定单元格的内容,存储在 Tile 对象中
// 传入的cell是一个键值对
// 返回的是cells[cell.x][cell.y]的值，即 Tile 对象
Grid.prototype.cellContent = function (cell) {
  if (this.withinBounds(cell)) {
    return this.cells[cell.x][cell.y];
  } else {
    return null;
  }
};

// 在这个位置插入一个tile值
Grid.prototype.insertTile = function (tile) {
  this.cells[tile.x][tile.y] = tile;
};
// 在这个位置移除一个tile值
Grid.prototype.removeTile = function (tile) {
  this.cells[tile.x][tile.y] = null;
};

// 检查给定的位置是否在网格的边界内
// 如果 position 在网格的边界内，则返回 true，否则返回 false。
Grid.prototype.withinBounds = function (position) {
  return position.x >= 0 && position.x < this.size &&
    position.y >= 0 && position.y < this.size;
};

// 返回一个对象，包含着网格的size和一个二维数组，这个数组的每个元素都有着当前的position和value
Grid.prototype.serialize = function () {
  var cellState = [];

  for (var x = 0; x < this.size; x++) {
    var row = cellState[x] = [];

    for (var y = 0; y < this.size; y++) {
      row.push(this.cells[x][y] ? this.cells[x][y].serialize() : null); // 引用tile对象的serialize()方法，将其序列化为一个对象
    }
  }

  return {
    size: this.size,
    cells: cellState
  };
};
