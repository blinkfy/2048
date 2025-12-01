function GameManager(size, InputManager, Actuator, StorageManager) {
      this.size = size; // 网格的大小
      this.inputManager = new InputManager; // new 运算符允许开发人员创建一个用户定义的对象类型的实例或具有构造函数的内置对象的实例。
      this.storageManager = new StorageManager;
      this.actuator = new Actuator;
      this.zombies = [];  // 初始化数组，用于存储僵尸对象
      this.startTiles = 2; // 开始时tile的数量

      this.loopAudio = new Audio('./audio/zombiesComing.mp3');
      this.firstAudio = new Audio('./audio/Graze_the_Roof.mp3');
      this.secondAudio = new Audio('./audio/Watery_Graves.mp3');
      this.firstSpawn = true;
      this.firstMusicPlayed = false;

      this.inputManager.on("move", this.move.bind(this)); // 注册move回调函数
      /* 如果你把 this.move.bind(this) 中的 this 改成 GameManager，会导致绑定失败，
      因为 GameManager 不是一个实例，而是一个构造函数。绑定方法需要将 this 绑定到一个具体的对象实例，
      而不是一个类（构造函数）。*/
      this.inputManager.on("restart", this.restart.bind(this)); // 注册restart回调函数
      this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));  // 注册keepPlaying回调函数
      this.halfCard = new halfCard(this); // 初始化 halfCard
      window.__zombieGameActive = true; // 全局活动标志，用于让子弹提前退出
      this.setup();
      this.spawnRate = 7000; // 初始生成间隔为7000毫秒（7秒）
      this.minSpawnRate = 4500; // 最小生成间隔为4500毫秒（4.5秒）
      this.spawnRateDecrement = 50; // 每次生成后减少50毫秒
      this.startSpawningZombies(); // 开始生成僵尸
      this.progress = 0; // 初始化进度为0
      this.updateProgress(0); //初始化进度条
      this.startProgressTimer(); // 开始更新进度条
      this.globalElapsedTime = 0; // 添加全局时间变量
      this.startGlobalTimer(); // 开始全局时间计时器
      this.hasWon = false;
      this.hasOver = false;
    }
    GameManager.prototype.startGlobalTimer = function () {
      setInterval(() => {
        this.globalElapsedTime += 0.005; // 每6秒增加全局时间
      }, 100000);
    };

    // 重启游戏
    GameManager.prototype.restart = function () {
      window.__zombieGameActive = false; // 先标记不活动，阻断子弹
      this.clearBullets(); // 清理残留子弹
      this.storageManager.clearGameState();
      this.actuator.continueGame(); // Clear the game won/lost message
      this.setup();
      window.__zombieGameActive = true; // 重新激活
      // 停止所有音频
      this.firstAudio.pause();
      this.firstAudio.currentTime = 0;
      this.secondAudio.pause();
      this.secondAudio.currentTime = 0;
      this.loopAudio.pause();
      this.loopAudio.currentTime = 0;
      this.firstSpawn = true;
      this.firstMusicPlayed = false;
      this.hasOver = false;
      this.hasWon = false;
      this.spawnRate = 7000; // 初始生成间隔为7000毫秒（7秒）
      this.minSpawnRate = 4500; // 最小生成间隔为4500毫秒（4.5秒）
      this.spawnRateDecrement = 50; // 每次生成后减少50毫秒
      this.startSpawningZombies(); // 开始生成僵尸
    };

    // 当2048赢了之后，游戏继续
    GameManager.prototype.keepPlaying = function () {
      this.keepPlaying = true;
      this.actuator.continueGame(); // Clear the game won/lost message
    };

    // 判断游戏是否结束 结束——>true 继续——>false
    GameManager.prototype.isGameTerminated = function () {
      if(this.won&&!this.hasWon){
        var winAudio = new Audio('./audio/winmusic.mp3');
        winAudio.play();
        this.hasWon = true;
      }
      return this.over || (this.won && !this.keepPlaying);
    };

    // 重启游戏
    GameManager.prototype.setup = function () {
      var previousState = this.storageManager.getGameState();

      // 从上一个游戏重新加载游戏（如果存在）
      if (previousState) {
        this.grid = new Grid(previousState.grid.size,
          previousState.grid.cells); // Reload grid
        this.score = previousState.score;
        this.over = previousState.over;
        this.won = previousState.won;
        this.keepPlaying = previousState.keepPlaying;
        this.hasWon = previousState.hasWon;
      } else {
        this.grid = new Grid(this.size);
        this.score = 0;
        this.over = false;
        this.won = false;
        this.keepPlaying = false;
        this.hasWon = false;
        // 添加开始的格子，格子数量由StartTiles决定
        this.addStartTiles();
      }
      // 更新画面
      this.actuate();
      this.clearZombies(); // 清空僵尸数组
      this.clearBullets(); // 清空子弹
      this.halfCard.init();

    };

    // 设置开始时tile的数量
    GameManager.prototype.addStartTiles = function () {
      for (var i = 0; i < this.startTiles; i++) {
        this.addRandomTile();
      }
    };

    // 随机添加一个tile
    GameManager.prototype.addRandomTile = function () {
      if (this.grid.cellsAvailable()) {
        var value = Math.random() < 0.9 ? 2 : 4;
        var tile = new Tile(this.grid.randomAvailableCell(), value);

        this.grid.insertTile(tile);
      }
    };

    // 把更新的grid送到actuator
    GameManager.prototype.actuate = function () {
      if (this.storageManager.getBestScore() < this.score) {
        this.storageManager.setBestScore(this.score);
        if (username != "none") {//__________________________________________________________________发送最高分数到服务器
          dataSend = "zombiescore=" + this.score + ",name=" + username + ";";
          var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function () {
              if (this.readyState == 4 && this.status == 200) {
                return this.responseText;
              }
            };
          xhttp.open("POST", dataSend, true);
          xhttp.send();
        }
      }

      // 如果游戏结束，则不再更新actuator，删除数据
      if (this.over) {
        this.storageManager.clearGameState();
        this.clearZombies(); // 清空僵尸数组
        this.isSpawningZombies = false; // 设置标志位为 false，停止生成僵尸
        this.stopProgressTimer(); // 停止进度条定时器
        // 停止所有音频
        this.firstAudio.pause();
        this.firstAudio.currentTime = 0;
        this.secondAudio.pause();
        this.secondAudio.currentTime = 0;
        this.loopAudio.pause();
        this.loopAudio.currentTime = 0;
        if(!this.hasOver) {
          const overAudio = new Audio('./audio/losemusic.mp3');
          overAudio.currentTime = 0;
          overAudio.play();
          this.hasOver = true;
        }
      } else {
        this.storageManager.setGameState(this.serialize());
      }

      this.actuator.actuate(this.grid, {
        score: this.score,
        over: this.over,
        won: this.won,
        bestScore: this.storageManager.getBestScore(),
        terminated: this.isGameTerminated() // bool
      });

    };

    // 统一清理当前所有子弹 DOM 元素
    GameManager.prototype.clearBullets = function () {
      try {
        const bullets = document.querySelectorAll('.bullet');
        bullets.forEach(b => b.remove());
      } catch (_) {}
    };
    // 游戏数据标准化
    GameManager.prototype.serialize = function () {
      return {
        grid: this.grid.serialize(),
        score: this.score,
        over: this.over,
        won: this.won,
        hasWon:this.hasWon,
        keepPlaying: this.keepPlaying
      };
    };

    // Save all tile positions and remove merger info
    GameManager.prototype.prepareTiles = function () {
      this.grid.eachCell(function (x, y, tile) {
        if (tile) {
          tile.mergedFrom = null;
          tile.savePosition();
        }
      });
    };

    // 移动tile，把tile移动到cell位置上
    GameManager.prototype.moveTile = function (tile, cell) {
      this.grid.cells[tile.x][tile.y] = null;
      this.grid.cells[cell.x][cell.y] = tile;
      tile.updatePosition(cell);
    };

    //  移动tile
    GameManager.prototype.move = function (direction) {
      // 0: up, 1: right, 2: down, 3: left
      var self = this;

      if (this.isGameTerminated()) return; // Don't do anything if the game's over

      var cell, tile;

      var vector = this.getVector(direction);
      var traversals = this.buildTraversals(vector);
      var moved = false;

      // 保存当前图块位置并删除合并信息
      this.prepareTiles();

      // 沿正确的方向遍历网格并移动图块
      traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) { // 相当于两次循环，每次循环后cell都被赋值
          cell = { x: x, y: y }; // 这里cell也算保存着当前遍历的位置
          tile = self.grid.cellContent(cell); // 返回一个tile对象

          if (tile) {
            var positions = self.findFarthestPosition(cell, vector); // 找到最远距离的位置,此时就是移动的目标位置,返回值是字典类型
            var next = self.grid.cellContent(positions.next);

            // Only one merger per row traversal?
            if (next && next.value === tile.value && !next.mergedFrom) {
              var merged = new Tile(positions.next, tile.value * 2); // 把两个相同的tile合并成一个tile
              merged.mergedFrom = [tile, next]; // 记录合并的两个tile
              var bullet = new Bullet(merged.value, {
                x: merged.x * 121 + 53.125, // 根据实际tile宽度调整
                y: merged.y * 121 + 53.125  // 根据实际tile高度调整
              });
              bullet.shoot(self.zombies); // 调用子弹的发射方法，传入僵尸数组
              self.grid.insertTile(merged); // 插入合并后的tile，这里对应的就是在原来的cells数组里面改了这个位置的tile了，不需要考虑tile的删除问题
              self.grid.removeTile(tile); // 删除原来的tile,这里删除的是cells数组里面的tile，而实际上的tile对象仍然存在，只是不再显示在界面上了

              // 由于实际上的tile对象仍然存在，这里更新了他的位置，
              tile.updatePosition(positions.next);

              // Update the score
              self.score += merged.value;

              // The mighty 2048 tile
              if (merged.value === 2048) self.won = true;
            } else {
              self.moveTile(tile, positions.farthest);
            } // 如果没有合并，则移动tile到最远距离的位置

            if (!self.positionsEqual(cell, tile)) {
              moved = true; // 由于cell保存着当前遍历的位置，所以如果移动了，则moved为true
            }
          }
        });
      });

      if (moved) {
        this.addRandomTile();

        if (!this.movesAvailable()) {
          this.over = true; // Game over!
        }

        this.actuate();
      }
    };

    // 得到游戏的方向向量
    GameManager.prototype.getVector = function (direction) {
      // Vectors representing tile movement
      var map = {
        0: { x: 0, y: -1 }, // Up
        1: { x: 1, y: 0 },  // Right
        2: { x: 0, y: 1 },  // Down
        3: { x: -1, y: 0 }   // Left
      };
      // 左上角是(0,0) 右下角是(4,4)
      return map[direction];
    };

    // 建立一个以正确顺序遍历的位置列表
    GameManager.prototype.buildTraversals = function (vector) {
      // 初始化遍历位置的数组
      var traversals = { x: [], y: [] };

      // 填充遍历位置的数组
      for (var pos = 0; pos < this.size; pos++) {
        traversals.x.push(pos);
        traversals.y.push(pos);
      }// 这个键值对，x是[0,1,2,3]，y也是[0,1,2,3]

      // 根据方向调整遍历顺序
      if (vector.x === 1) traversals.x = traversals.x.reverse(); // 右移，x轴反向
      if (vector.y === 1) traversals.y = traversals.y.reverse(); // 下移，y轴反向

      return traversals;
    };

    GameManager.prototype.findFarthestPosition = function (cell, vector) {
      var previous;

      do {
        previous = cell;
        cell = { x: previous.x + vector.x, y: previous.y + vector.y };
      } while (this.grid.withinBounds(cell) &&
        this.grid.cellAvailable(cell)); // 网格边界内且没有障碍物

      return {
        farthest: previous,
        next: cell // Used to check if a merge is required
      };
    }; // 这里的vector方向为上下左右，所以只会检测同一行或者同一列的最远距离

    GameManager.prototype.movesAvailable = function () {
      return this.grid.cellsAvailable() || this.tileMatchesAvailable();
    };

    // 检查是否有tile可以合并 可以——返回true，不能——返回false
    GameManager.prototype.tileMatchesAvailable = function () {
      var self = this;

      var tile;

      for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) {
          tile = this.grid.cellContent({ x: x, y: y });

          if (tile) {
            for (var direction = 0; direction < 4; direction++) {
              var vector = self.getVector(direction); // 四个方向上都要检查是否有相同的tile
              var cell = { x: x + vector.x, y: y + vector.y }; // 计算下一个tile的位置

              var other = self.grid.cellContent(cell);

              if (other && other.value === tile.value) {
                return true; // 可以合并，返回true
              }
            }
          }
        }
      }

      return false;
    };

    // 判断两个位置是否相同，相同——返回true，不同——返回false
    GameManager.prototype.positionsEqual = function (first, second) {
      return first.x === second.x && first.y === second.y;
    };

    // 僵尸初始化
    GameManager.prototype.zombieInit = function () {
      var gameContainer = document.querySelector('.game-container');
      var zombie = new Zombie(48, 2, gameContainer, './image/Zombie/Zombie_walking.gif', this);
      this.zombies.push(zombie);
    };

    GameManager.prototype.bucketheadZombieInit = function () {
      var gameContainer = document.querySelector('.game-container');
      var bucketheadZombie = new Zombie(198, 1.9, gameContainer, './image/Zombie/BucketheadZombie.gif', this);
      this.zombies.push(bucketheadZombie);
    };

    GameManager.prototype.newspaperZombieInit = function () {
      var gameContainer = document.querySelector('.game-container');
      var newspaperZombie = new Zombie(128, 2.1, gameContainer, './image/Zombie/NewspaperZombiewalking.gif', this);
      this.zombies.push(newspaperZombie);
    };

    // 撑杆跳僵尸
    GameManager.prototype.poleVaultZombieInit = function () {
      var gameContainer = document.querySelector('.game-container');
      // 初始为带杆行走图，速度较快
      var poleZombie = new Zombie(128, 3.2, gameContainer, './image/Zombie/PoleVaultingZombie.gif', this);
      this.zombies.push(poleZombie);
    };

    GameManager.prototype.startSpawningZombies = function () {
      this.isSpawningZombies = true; // 初始化时设置为 true
      let spawnBuckethead = false; // 记录是否开始生成桶头僵尸
      let spawnNewspaper = false; // 记录是否开始生成报纸僵尸
      let spawnPole = false; // 记录是否开始生成撑杆跳僵尸

      const spawn = () => {
        if (!this.isSpawningZombies) return; // 如果标志位为 false，则停止生成僵尸
        if (window.gamePaused) { // 如果游戏暂停，延迟生成
          setTimeout(spawn, 100);
          return;
        }

        if (this.firstSpawn) {
          this.loopAudio.play();
          console.log('zombies coming');
          if (!this.firstMusicPlayed) {
            this.firstAudio.play();
            console.log('first music played');
            this.firstAudio.onended = () => {
              this.secondAudio.play();
              this.secondAudio.onended = () => { };
            };
            this.firstMusicPlayed = true;
          }
          this.firstSpawn = false;
        }
        if (spawnNewspaper && spawnPole) {
          let r = Math.random();
          if (r < 0.45) {
            this.zombieInit();
          } else if (r < 0.6) {
            this.bucketheadZombieInit();
          } else if (r < 0.85) {
            this.newspaperZombieInit();
          } else {
            this.poleVaultZombieInit();
          }
        } else if (spawnNewspaper) {
          let randomValue = Math.random();
          if (randomValue < 0.65) {
            this.zombieInit();
          } else if (randomValue < 0.82) {
            this.bucketheadZombieInit();
          } else {
            this.newspaperZombieInit();
          }
        } else if (spawnBuckethead) {
          if (Math.random() < 0.68) {
            this.zombieInit();
          } else {
            this.bucketheadZombieInit();
          }
        } else {
          this.zombieInit();
        }

        // 生成后调整下次生成的时间（受速度影响）
        this.spawnRate = Math.max(this.minSpawnRate, this.spawnRate - this.spawnRateDecrement);
        setTimeout(spawn, this.spawnRate / (window.gameSpeedMultiplier || 1));
      };

      // 25秒后开始生成桶头僵尸（受速度影响）
      setTimeout(() => {  
        spawnBuckethead = true;
      }, 25000 / (window.gameSpeedMultiplier || 1));

      // 45秒后开始生成报纸僵尸（受速度影响）
      setTimeout(() => {
        spawnNewspaper = true;
      }, 45000 / (window.gameSpeedMultiplier || 1));

      // 60秒后开始生成撑杆跳僵尸（受速度影响）
      setTimeout(() => {
        spawnPole = true;
      }, 60000 / (window.gameSpeedMultiplier || 1));

      setTimeout(spawn, this.spawnRate / (window.gameSpeedMultiplier || 1));
    };

    GameManager.prototype.clearZombies = function () {
      // 遍历僵尸数组，从 DOM 中移除每个僵尸的元素
      this.zombies.forEach(zombie => {
        if (zombie.element.parentNode) {
          zombie.element.parentNode.removeChild(zombie.element);
        }
      });
      // 清空僵尸数组
      this.zombies = [];
    };

    GameManager.prototype.updateProgress = function (percentage) {
      var progressFull = document.getElementById('progress-full');
      var newwidth = 100 - percentage;
      progressFull.style.clipPath = `inset(0 ${newwidth}% 0 0)`;
    }
    GameManager.prototype.startProgressTimer = function () {
      this.progressInterval = setInterval(() => {
        if (window.gamePaused) return; // 如果游戏暂停，不更新进度
        if (this.progress >= 100) {
          clearInterval(this.progressInterval);
          this.keepPlaying();
        } else {
          this.progress += 1; // 每次增加的进度百分比
          this.updateProgress(this.progress);
        }
      }, 1500); // 每1.5秒更新一次进度
    };

    GameManager.prototype.stopProgressTimer = function () {
      clearInterval(this.progressInterval);
    };
