const hitSound1 = new Audio('./audio/splat3.mp3');
const hitSound2 = hitSound1.cloneNode(true);
const hitSound3 = hitSound1.cloneNode(true);
var hitSoundTimes=0;
const initialBulletImg=new Image();
const hitBulletImg=new Image();
initialBulletImg.src='./image/Plants/PB01.gif'    //子弹
hitBulletImg.src='./image/Plants/PeaBulletHit.gif'// 子弹击中后的图像
function Bullet(value, position) {
  this.value = value; // 子弹的伤害值，与数字相同
  this.position = position; // 子弹的初始位置
  this.element = null; // 子弹的DOM元素
  this.create = function () {
    this.element = document.createElement('div');
    this.element.classList.add('bullet');
    this.element.textContent = this.value; // 设置子弹上的数字
    this.element.style.left = `${this.position.x}px`;
    this.element.style.top = `${this.position.y}px`;
    this.element.style.backgroundImage = `url(${initialBulletImg.src})`; // 设置初始图像
    this.element.style.backgroundSize = 'cover'; // 根据需要调整
    document.querySelector('.game-container').appendChild(this.element);
    console.log('子弹创建成功 at position', this.position);
  };

  this.shoot = function (zombies) {
    // 子弹发射逻辑，这里简化为水平向右移动
  var self = this;
  var gridBound = document.querySelector('.game-container').getBoundingClientRect();
  // 与 CSS 右侧淡出宽度保持一致的移除缓冲（.game-container::after ~56px，mask ~48px）
  var fadeBuffer = 256; 

    function moveRight() {
      // 提前退出条件：游戏已结束或元素已被移除
      if (typeof window !== 'undefined' && window.__zombieGameActive === false) {
        if (self.element) self.element.remove();
        return;
      }
      if (!self.element || !self.element.isConnected) {
        return;
      }
      // 如果游戏暂停，继续等待但不移动
      if (window.gamePaused) {
        requestAnimationFrame(moveRight);
        return;
      }
      // 应用全局游戏速度系数
      var speedMultiplier = window.gameSpeedMultiplier || 1;
      self.position.x += 2 * speedMultiplier; // 每次移动的像素数随速度调整
      self.element.style.left = self.position.x + 'px';
  
      // 碰撞和移出屏幕的检测逻辑保持不变
      for (var i = 0; i < zombies.length; i++) {
        if (!zombies[i].collidesWith(self) && zombies[i].alive) {
          clearInterval(moveRight);
          self.element.style.backgroundImage = `url(${hitBulletImg.src})`; // 更改为击中图像
          // 播放击中僵尸的声音
          if(hitSoundTimes==0){
            hitSound1.currentTime=0;
            hitSound1.play();
            hitSoundTimes++;
          }else if(hitSoundTimes==1){
            hitSound2.currentTime=0;
            hitSound2.play();
            hitSoundTimes++;
          }else{
            hitSound3.currentTime=0;
            hitSound3.play();
            hitSoundTimes=0;
          }
          // 延时移除子弹
          setTimeout(() => {
            self.element.remove();
          }, 200); // 击中动画持续时间
          zombies[i].hit(self.value); // 对僵尸造成伤害
          console.log('子弹击中僵尸');
          return;
        };
      };
  
  // 在进入右侧若隐若现区域后，不要立即消失；
  // 允许继续前进到容器宽度 + 淡出缓冲后再移除
  if (self.position.x < gridBound.width + fadeBuffer) {
        requestAnimationFrame(moveRight); // 继续动画
      } else {
        self.element.remove(); // 移除子弹
        console.log('子弹移出屏幕');
      }
    }
    requestAnimationFrame(moveRight); // 开始动画
  };
  this.create(); // 创建子弹DOM元素
}