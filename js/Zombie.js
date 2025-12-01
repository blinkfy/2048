// 内存缓存，用于存储 GIF 字节；每次播放时创建新的 Object URL 以重新启动动画
const GIF_BUFFER_CACHE = new Map(); // key: path, value: ArrayBuffer

async function getGifObjectURL(path) {
    try {
        let buffer = GIF_BUFFER_CACHE.get(path);
        if (!buffer) {
            const resp = await fetch(path, { cache: "force-cache" });
            buffer = await resp.arrayBuffer();
            GIF_BUFFER_CACHE.set(path, buffer);
        }
        const blob = new Blob([buffer], { type: 'image/gif' });
        return URL.createObjectURL(blob);
    } catch (e) {
        // 回退: 返回原始路径
        return path;
    }
}

function Zombie(health, speed, gameContainer, url, gameManager) {
    this.health = health;
    this.speed = speed;
    this.gameContainer = gameContainer;
    this.alive = true; // 添加 alive 状态
    this.url = url;
    this.gameManager = gameManager; // 保存 GameManager 实例
    this.isColliding = false; // 增加 isColliding 标志
    this.hasChanged = false;
    this.eatAudioId=10;
    // 撑杆跳僵尸状态
    this.isPoleVaulter = /PoleVaultingZombie/i.test(this.url);
    this.isPoleJumping = false;
    this.create();
    this.intervalId = setInterval(() => {
        this.move();
    }, 100); // 控制移动速度的定时器
    console.log('Zombie created');
}

Zombie.prototype.move = function () {
    if (!this.alive || this.isColliding) return; // 如果僵尸已经死亡或正在碰撞，不再移动
    if (window.gamePaused) return; // 如果游戏暂停，不移动

    // 应用全局游戏速度系数
    var speedMultiplier = window.gameSpeedMultiplier || 1;
    this.position.x -= this.speed * speedMultiplier;
    this.element.style.left = this.position.x + 'px';
    // 撑杆跳僵尸宽280px，需要完全离开屏幕左侧才算输
    if (this.isPoleVaulter && this.position.x < -350) {
        if (this.element.parentNode) { // 检查 parentNode 是否存在
            this.element.parentNode.removeChild(this.element); // 如果僵尸走出屏幕，移除它
            this.gameManager.over = true; // 设置游戏结束标志
            this.gameManager.actuate();
        }
        clearInterval(this.intervalId); // 停止间隔调用
        // 普通僵尸宽约91-150px，让僵尸完全离开屏幕左侧
    } else if (this.position.x < -180) {
        if (this.element.parentNode) { // 检查 parentNode 是否存在
            this.element.parentNode.removeChild(this.element); // 如果僵尸走出屏幕，移除它
            this.gameManager.over = true; // 设置游戏结束标志
            this.gameManager.actuate();
        }
        clearInterval(this.intervalId); // 停止间隔调用
    }
};

Zombie.prototype.checkCollision = function () {
    if (!this.alive) return;
    if (window.gamePaused) return; // 如果游戏暂停，不进行碰撞检测

    // 撑杆跳僵尸在跳跃过程中不进行碰撞检测
    if (this.isPoleJumping) return;

    let isColliding = false;
    // 碰撞检测
    this.gameManager.grid.cells.forEach(column => {
        column.forEach(cell => {
            if (cell && this.checkCollisionWithTile(cell)) {
                // 撑杆跳僵尸：首次遇到方块执行跳跃，越过一格且不伤害该方块
                if (this.isPoleVaulter && !this.hasChanged && !this.isPoleJumping) {
                    this.startPoleVaultJump();
                    isColliding = false; // 跳跃中不算持续碰撞
                } else {
                    this.hitTile(cell, this.gameManager);
                    this.switchToAttackImage();
                    isColliding = true;
                }
            }
        });
    });

    // 如果没有碰撞，则恢复原始图片和不透明度，并清理伤害定时器
    if (!isColliding) {
        this.clearDamageInterval(); // 清理之前的伤害定时器
        this.isColliding = false;
        this.restoreImage();
    }
};

// 执行撑杆跳：两段跳动图，结束后越过一格并降速，切到无杆行走
Zombie.prototype.startPoleVaultJump = function () {
    if (this.isPoleJumping || !this.isPoleVaulter) return;
    this.isPoleJumping = true;
    this.isColliding = true; // 暂停普通移动

    const jump1 = './image/Zombie/PoleVaultingZombieJump.gif';
    const jump2 = './image/Zombie/PoleVaultingZombieJump2.gif';
    const walkAfter = './image/Zombie/PoleVaultingZombieWalk.gif';

    // 第一段起跳
    //this.crossfadeBackground(jump1);
    this.url = jump1;
    this.element.style.backgroundImage = `url(${this.url})`;
    var speedMultiplier = window.gameSpeedMultiplier || 1;
    setTimeout(() => {
        // 第二段腾空
        //this.crossfadeBackground(jump2);
        this.url = jump2;
        this.element.style.backgroundImage = `url(${this.url})`;
        this.position.x -= 100;
        this.element.style.left = this.position.x + 'px';
        setTimeout(() => {
            // 越过一格
            this.position.x -= 50;
            this.element.style.left = this.position.x + 'px';

            // 失去长杆：降速并切换为无杆行走
            this.hasChanged = true;
            this.isPoleJumping = false;
            this.isColliding = false;
            this.url = walkAfter;
            // 跳后速度降为接近普通僵尸
            this.speed = Math.max(1.8, Math.min(this.speed, 2.2));
            this.crossfadeBackground(walkAfter);
        }, 380 / speedMultiplier); // 第二段持续时间（受速度影响）
    }, 520 / speedMultiplier); // 第一段持续时间（受速度影响）
};

Zombie.prototype.hit = function (damage) {
    this.health -= damage;
    if (this.health <= 0) {
        this.die();
    } else {
        this.flash();
        // 检查是否需要进入暴走状态
        if(!this.hasChanged){
            if (this.health < 60 && this.url.includes('NewspaperZombie')) {
                this.enterRageMode();
                console.log('Zombie is in rage mode');
                this.hasChanged = true;
            } else if (this.health < 48 && this.url.includes('BucketheadZombie')) {
                this.speed = 2;
                const newUrl = `./image/Zombie/Zombie_walking.gif`;
                this.url = newUrl;
                // 平滑切换到普通僵尸贴图
                this.crossfadeBackground(newUrl);
                this.hasChanged = true;
            }
        }
    }
};

const newspaper_rarrgh2 = new Audio('./audio/newspaper_rarrgh2.mp3');
Zombie.prototype.enterRageMode = function () {
    newspaper_rarrgh2.play();
    this.speed = 3.6; // 提升速度
    const rageUrl = `./image/Zombie/NewspaperZombieAngry.gif`;
    this.url = rageUrl; // 更新图片路径
    this.crossfadeBackground(rageUrl);
};

// 平滑切换背景图：叠加一层覆盖，做 180ms 交叉淡入，再落到主元素背景并移除覆盖
Zombie.prototype.crossfadeBackground = function (newUrl) {
    if (!this.element) return;
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 280ms linear';
    overlay.style.backgroundImage = `url(${newUrl})`;
    // 继承/推断显示策略，避免尺寸差异导致跳变
    const isPoleNew = /PoleVaultingZombie/i.test(newUrl);
    const bgSize = this.element.style.backgroundSize || ((this.url.includes('NewspaperZombie') || isPoleNew || this.isPoleVaulter) ? 'contain' : 'cover');
    const bgRepeat = this.element.style.backgroundRepeat || 'no-repeat';
    const bgPosition = this.element.style.backgroundPosition || ((isPoleNew || this.isPoleVaulter) ? 'left bottom' : (this.url.includes('NewspaperZombie') ? 'left top' : 'left top'));
    overlay.style.backgroundSize = bgSize;
    overlay.style.backgroundRepeat = bgRepeat;
    overlay.style.backgroundPosition = bgPosition;

    this.element.appendChild(overlay);
    // 强制回流以应用初始样式
    void overlay.offsetWidth;
    overlay.style.opacity = '1';

    const finish = () => {
        this.element.style.backgroundImage = `url(${newUrl})`;
        // 与覆盖层保持一致的显示策略
        this.element.style.backgroundSize = bgSize;
        this.element.style.backgroundRepeat = bgRepeat;
        this.element.style.backgroundPosition = bgPosition;
        overlay.removeEventListener('transitionend', finish);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    overlay.addEventListener('transitionend', finish);
};

Zombie.prototype.flash = function () {
    this.element.classList.add('flash');
    setTimeout(() => {
        this.element.classList.remove('flash');
    }, 300); // 闪烁动画的持续时间
};

Zombie.prototype.create = function () {
    this.element = document.createElement('div');
    this.element.classList.add('zombie');
    // 让尺寸与透明度变化更顺滑
    this.element.style.transition = 'opacity 180ms linear, width 180ms ease, height 180ms ease';

    // 判断是否为报纸僵尸，并设置相应的宽度和高度
    if (this.url.includes('NewspaperZombie')) {
        this.element.style.width = '150px';
        this.element.style.height = '150px';
        this.element.style.backgroundSize = 'contain';
        this.element.style.backgroundRepeat = 'no-repeat';
        this.element.style.backgroundPosition = 'left top';
    } else if (this.url.includes('BucketheadZombie')) {
        this.element.style.width = '94px';
        this.element.style.height = '135px';
    } else if (this.url.includes('PoleVaultingZombie')) {
        // 撑杆跳僵尸：横向较长，使用 contain 避免被裁切
        this.element.style.width = '280px';
        this.element.style.height = '200px';
        this.element.style.backgroundSize = 'contain';
        this.element.style.backgroundRepeat = 'no-repeat';
        this.element.style.backgroundPosition = 'left bottom';
    } else {
        this.element.style.width = '91px';
        this.element.style.height = '140px';
    }

    // 设置位置（在设置尺寸之后）
    const numbers = [0, 121, 242, 363, 484];
    let randomY = numbers[Math.floor(Math.random() * numbers.length)];

    // 撑杆跳僵尸：高度200px，需要调整Y坐标使其底部对齐格子底部
    // 格子高度约121px，僵尸高度200px，所以需要向上偏移 (200-121) = 79px
    if (this.url.includes('PoleVaultingZombie')) {
        randomY = randomY - 59; // 向上调整，让底部对齐格子
    }

    this.position = {
        x: this.gameContainer.offsetWidth - this.element.offsetWidth - this.element.offsetWidth, // 从最右侧开始
        y: randomY
    };
    this.element.style.top = `${this.position.y}px`;
    this.element.style.left = `${this.position.x}px`;
    this.element.style.backgroundImage = `url(${this.url})`;

    this.gameContainer.appendChild(this.element);

    // 启动碰撞检测定时器
    this.collisionIntervalId = setInterval(() => {
        this.checkCollision();
    }, 100); // 每0.1秒执行一次碰撞检测
};


// 僵尸和子弹的碰撞检测 碰撞——True
Zombie.prototype.collidesWith = function (bullet) {

    var zombieRect = this.element.getBoundingClientRect();
    var bulletRect = bullet.element.getBoundingClientRect();

    // 撑杆跳僵尸：横向图片很长，实际身体在右侧约40%区域
    var effectiveLeft = zombieRect.left;
    var effectiveTop = zombieRect.top;
    var effectiveBottom = zombieRect.bottom;

    if (this.isPoleVaulter) {
        effectiveLeft = zombieRect.left + (zombieRect.width * 0.5); // 取右侧50%作为有效碰撞区
        // 撑杆跳僵尸高度200px，缩小到约121px的有效碰撞高度（从底部向上121px）
        effectiveTop = zombieRect.bottom - 121; // 只取底部121px高度作为碰撞区
    } else {
        effectiveLeft = zombieRect.left + 30; // 其他僵尸保持原偏移
    }

    return !!(zombieRect.right < bulletRect.left ||
        effectiveLeft > bulletRect.right ||
        effectiveBottom < bulletRect.top ||
        effectiveTop > bulletRect.bottom);
};

Zombie.prototype.die = function () {
    this.alive = false; // 设置僵尸为死亡状态
    clearInterval(this.intervalId); // 停止移动定时器
    if (this.collisionIntervalId) {
        clearInterval(this.collisionIntervalId);
    }
    this.clearDamageInterval(); // 清理伤害定时器

    // 隐藏原来的僵尸元素
    this.element.style.display = 'none';

    // 判断是否为报纸僵尸，并使用相应的死亡图片
    let zombieDieGif;
    let zombieHeadImg;
    let zombieDieWidth = '203px';
    let zombieDieHeight = '98px';
    let zombieHeadWidth = '150px';
    let zombieHeadHeight = '186px';
    let Zombietop = 30;
    let Zombieleft = 79.5;

    if (this.url.includes('NewspaperZombie')) {
        zombieDieGif = './image/Zombie/NewspaperZombieDiebody.gif';
        zombieHeadImg = './image/Zombie/NewspaperZombieDiehead.gif';
        zombieDieWidth = '160px'; // 调整大小
        zombieDieHeight = '160px';
        Zombietop = 10;
        Zombieleft = 70;
    } else if (/PoleVaultingZombie/i.test(this.url)) {
        zombieDieGif = './image/Zombie/PoleVaultingZombieDie.gif';
        zombieHeadImg = './image/Zombie/PoleVaultingZombieHead.gif';
        zombieDieWidth = '280px'; // 撑杆跳僵尸死亡图放大
        zombieDieHeight = '140px';
        zombieHeadWidth = '180px'; // 头部也相应放大
        zombieHeadHeight = '220px';
        Zombietop = 40;
        Zombieleft = 90;
    } else {
        zombieDieGif = './image/Zombie/ZombieDie.gif';
        zombieHeadImg = './image/Zombie/ZombieHead.gif';
    }

    const bodyPath = zombieDieGif;
    const headPath = zombieHeadImg;

    // 内存缓存，用于存储 GIF 字节；每次播放时创建新的 Object URL 以重新启动动画
    Promise.all([getGifObjectURL(bodyPath), getGifObjectURL(headPath)]).then(([bodyURL, headURL]) => {
        const zombieDieElement = document.createElement('img');
        zombieDieElement.src = bodyURL;
        zombieDieElement.style.position = 'absolute';
        zombieDieElement.style.top = `${this.position.y + Zombietop}px`;
        zombieDieElement.style.left = `${this.position.x - Zombieleft}px`;
        zombieDieElement.style.width = zombieDieWidth;
        zombieDieElement.style.height = zombieDieHeight;
        zombieDieElement.style.objectFit = 'contain';
        zombieDieElement.style.zIndex = '100';
        this.gameContainer.appendChild(zombieDieElement);

        const zombieHeadElement = document.createElement('img');
        zombieHeadElement.src = headURL;
        zombieHeadElement.style.position = 'absolute';
        zombieHeadElement.style.width = zombieHeadWidth;
        zombieHeadElement.style.height = zombieHeadHeight;
        zombieHeadElement.style.left = this.position.x + 'px';
        zombieHeadElement.style.top = this.position.y + 'px';
        zombieHeadElement.style.objectFit = 'contain';
        zombieHeadElement.style.zIndex = '101';
        this.gameContainer.appendChild(zombieHeadElement);

        // 可选：延时移除僵尸并释放对象 URL
        setTimeout(() => {
            zombieDieElement.remove();
            zombieHeadElement.remove();
            try {
                if (bodyURL && bodyURL.startsWith('blob:')) URL.revokeObjectURL(bodyURL);
                if (headURL && headURL.startsWith('blob:')) URL.revokeObjectURL(headURL);
            } catch (e) { }
        }, 1000); // 动图持续时间，单位毫秒
    }).catch(() => {
        // Fallback: use direct paths if something goes wrong
        const zombieDieElement = document.createElement('img');
        zombieDieElement.src = bodyPath;
        zombieDieElement.style.position = 'absolute';
        zombieDieElement.style.top = `${this.position.y + Zombietop}px`;
        zombieDieElement.style.left = `${this.position.x - Zombieleft}px`;
        zombieDieElement.style.width = zombieDieWidth;
        zombieDieElement.style.height = zombieDieHeight;
        zombieDieElement.style.objectFit = 'contain';
        zombieDieElement.style.zIndex = '100';
        this.gameContainer.appendChild(zombieDieElement);

        const zombieHeadElement = document.createElement('img');
        zombieHeadElement.src = headPath;
        zombieHeadElement.style.position = 'absolute';
        zombieHeadElement.style.width = '150px';
        zombieHeadElement.style.height = '186px';
        zombieHeadElement.style.left = this.position.x + 'px';
        zombieHeadElement.style.top = this.position.y + 'px';
        zombieHeadElement.style.objectFit = 'contain';
        zombieHeadElement.style.zIndex = '101';
        this.gameContainer.appendChild(zombieHeadElement);

        setTimeout(() => {
            zombieDieElement.remove();
            zombieHeadElement.remove();
        }, 1000);
    });
};

Zombie.prototype.checkCollisionWithTile = function (tile) {
    var zombieRect = this.element.getBoundingClientRect();
    var tileElement = document.querySelector('.tile-position-' + (tile.x + 1) + '-' + (tile.y + 1));
    if (tileElement) {
        var tileRect = tileElement.getBoundingClientRect();

        // 缩小僵尸碰撞区域，只检测核心区域
        var collisionBuffer = 45; // 调整这个值来缩小碰撞检测区域
        var leftBuffer = collisionBuffer;
        var topBuffer = collisionBuffer;
        var rightBuffer = collisionBuffer;

        // 撑杆跳僵尸：横向图片很长，左侧大量空白，身体在右半部分
        if (this.isPoleVaulter) {
            leftBuffer = zombieRect.width * 0.55; // 左侧裁掉50%（杆子+空白区域）
            // 撑杆跳僵尸高度200px，但只取底部121px作为有效碰撞区（与格子高度一致）
            topBuffer = 79; // 顶部裁掉79px（200 - 121 = 79）
            rightBuffer = zombieRect.width * 0.45; // 右侧裁掉45%
        }

        var coreZombieRect = {
            left: zombieRect.left + leftBuffer,
            right: zombieRect.right - rightBuffer,
            top: zombieRect.top + topBuffer,
            bottom: zombieRect.bottom - collisionBuffer
        };

        if (!(coreZombieRect.right < tileRect.left ||
            coreZombieRect.left > tileRect.right ||
            coreZombieRect.bottom < tileRect.top ||
            coreZombieRect.top > tileRect.bottom)) {
            return true;
        }
    }
    return false;
};

const eatAudio = [];
for (let i = 0; i < 10; i++) {
    eatAudio[i] = new Audio('./audio/zombiesEat.mp3');
}
Zombie.prototype.hitTile = function (tile, gameManager) {
    // 如果已经在攻击这个方块，不重复创建定时器
    if (this.currentTargetTile === tile && this.damageInterval) {
        return;
    }

    // 清理之前的攻击定时器（如果存在）
    this.clearDamageInterval();

    this.isColliding = true; // 标记碰撞状态
    this.currentTargetTile = tile; // 记录当前攻击目标

    // 每0.1秒对方块造成1点伤害（受速度影响）
    var speedMultiplier = window.gameSpeedMultiplier || 1;
    var eatTime=0;
    this.damageInterval = setInterval(() => {
        // 检查方块是否还存在于网格中
        const tileStillExists = gameManager.grid.cells.some(column => 
            column.some(cell => cell === tile)
        );

        if (!this.alive || tile.health <= 0 || !tileStillExists) {
            this.clearDamageInterval(); // 停止对方块的伤害
            if (tile.health <= 0) {
                gameManager.grid.removeTile(tile);
                this.isColliding = false; // 重置碰撞标志
                // 删除方块的 DOM 元素
                const tileElement = document.querySelector('.tile-position-' + (tile.x + 1) + '-' + (tile.y + 1));
                if (tileElement) {
                    tileElement.remove();
                }

                this.restoreImage(); // 恢复原始图片
            }
            return;
        }
        
        setTimeout(()=>{
            if(this.alive&&tile.health>0){
                if(this.eatAudioId==10){
                    for(let i=0;i<eatAudio.length;i++){
                        if (eatAudio[i].paused) {
                            eatAudio[i].currentTime = 0;
                            eatAudio[i].play();
                            this.eatAudioId = i;
                            break;
                        }
                    }
                }else if(eatAudio[this.eatAudioId].paused){
                    eatAudio[this.eatAudioId].currentTime = 0;
                    eatAudio[this.eatAudioId].play();
                }
            }
        }, Math.random() * 500);
        // 逐渐增加的伤害，最大上限为 0.5
        eatTime += 0.08;
        let damage = 0.01 * eatTime;
        if (damage > 0.5) {
            damage = 0.5;
        }
        let damagemax = Math.max(damage, 0.01);
        if (this.isColliding) {
            tile.health -= damagemax; // 每次碰撞减少damage点血量
        }
        
        // 当血量降到一半时，方块数值减半并更新视觉样式
        if(tile.health <= tile.value / 2 &&tile.value > 2){
            tile.value = tile.value / 2;
            // 更新方块的DOM显示（数字和样式）
            const tileElement = document.querySelector('.tile-position-' + (tile.x + 1) + '-' + (tile.y + 1));
            if (tileElement) {
                // 更新数字显示
                const tileInner = tileElement.querySelector('.tile-inner');
                if (tileInner) {
                    tileInner.textContent = tile.value;
                }
                // 更新样式类
                tileElement.className = tileElement.className.replace(/tile-\d+/g, '');
                tileElement.classList.add('tile-' + tile.value);
                
                // 添加一个视觉反馈动画（可选）
                tileElement.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    tileElement.style.transform = '';
                }, 150);
            }
            // 触发actuate更新整体显示
            if (gameManager.actuate) {
                gameManager.actuate();
            }
        }

        if (tile.health <= 0 || this.gameManager.won || this.gameManager.over) {
            gameManager.grid.removeTile(tile);
            this.clearDamageInterval(); // 停止对方块的伤害
            this.isColliding = false; // 重置碰撞标志
            this.eatAudioId = 10;
            // 删除方块的 DOM 元素
            const tileElement = document.querySelector('.tile-position-' + (tile.x + 1) + '-' + (tile.y + 1));
            if (tileElement) {
                tileElement.remove();
            }

        } else {
            // 更新血量条的宽度
            const healthBar = tile.healthBar;
            if (healthBar) {
                requestAnimationFrame(() => {
                    healthBar.style.width = (tile.health / tile.value * 100) + "%"; // 更新血量条宽度
                });
            }
        }
    }, 100 / speedMultiplier); // 每0.1秒执行一次
};

// 清理伤害定时器的辅助方法
Zombie.prototype.clearDamageInterval = function () {
    if (this.damageInterval) {
        clearInterval(this.damageInterval);
        this.damageInterval = null;
        this.currentTargetTile = null;
    }
};

const zattack = new Image();
const battack = new Image();
const nattack = new Image();
zattack.src = './image/Zombie/ZombieAttack.gif';
battack.src = './image/Zombie/BucketheadZombieAttack.gif';
nattack.src = './image/Zombie/NewspaperZombieAttack.gif';
Zombie.prototype.switchToAttackImage = function () {
    // 切换为攻击状态图片，并降低不透明度
    if (this.url.includes('Zombie_walking.gif')) {
        this.crossfadeBackground(zattack.src);
    } else if (this.url.includes('BucketheadZombie.gif')) {
        this.crossfadeBackground(battack.src);
    } else if (this.url.includes('NewspaperZombiewalking.gif')) {
        this.crossfadeBackground(nattack.src);
        this.element.style.width = '130px';
        this.element.style.height = '130px';
    } else if (/PoleVaultingZombie/i.test(this.url)) {
        const pAttack = './image/Zombie/PoleVaultingZombieAttack.gif';
        this.crossfadeBackground(pAttack);
        this.element.style.width = '280px';
        this.element.style.height = '200px';
        this.element.style.backgroundSize = 'contain';
        this.element.style.backgroundRepeat = 'no-repeat';
        this.element.style.backgroundPosition = 'left bottom';
    }
    this.element.style.opacity = '0.5';
};

Zombie.prototype.restoreImage = function () {
    // 恢复原始图片和不透明度
    this.crossfadeBackground(this.url);
    if (this.url.includes('NewspaperZombie')) {
        this.element.style.width = '130px';
        this.element.style.height = '130px';
        this.element.style.backgroundSize = 'contain';
        this.element.style.backgroundRepeat = 'no-repeat';
        this.element.style.backgroundPosition = 'left top';
    } else if (/PoleVaultingZombie/i.test(this.url)) {
        this.element.style.width = '280px';
        this.element.style.height = '200px';
        this.element.style.backgroundSize = 'contain';
        this.element.style.backgroundRepeat = 'no-repeat';
        this.element.style.backgroundPosition = 'left bottom';
    } else {
        this.element.style.width = '91px';
        this.element.style.height = '140px';
    }
    this.element.style.opacity = '1';
};