function halfCard(GameManager) {
    this.card = document.querySelector(".half-card");
    this.tilesContainer = document.querySelector(".tile-container");
    this.GameManager = GameManager;
}

halfCard.prototype.init = function () {
    this.addDragStartListener();
    this.addDragOverListener();
    this.addDropListener();
};

halfCard.prototype.addDragStartListener = function () {
    const audio = new Audio('./audio/tap.mp3');
    this.card.addEventListener("dragstart", function (halfCard) {
        console.log("drag start");
        halfCard.dataTransfer.setData("abcd", "half-card");
        halfCard.dataTransfer.dropEffect = "move";
         // 播放音频
         audio.play();
    });
};

halfCard.prototype.addDragOverListener = function () {
    this.tilesContainer.addEventListener("dragover", function (halfCardtilesContainer) {
        halfCardtilesContainer.preventDefault();
        halfCardtilesContainer.dataTransfer.dropEffect = "move";
    });
};
// 更新 tile 的值
halfCard.prototype.updateTileValue = function (tile, value) {
    tile.textContent = value;
    tile.classList.remove(`tile-${value * 2}`);
    tile.classList.add(`tile-${value}`);
}
halfCard.prototype.addDropListener = function () {
    var self = this; // 保存对 halfCard 实例的引用
    this.tilesContainer.addEventListener("drop", (e) => { // 使用箭头函数
        e.preventDefault();
        const data = e.dataTransfer.getData("abcd");
        if (data === "half-card") {
            const tile = e.target.closest(".tile-inner");
            const arr = e.target.parentNode.className.split("position-")[1].substring(0, 3).split("-");
            if (tile) {
                const tileValue = parseInt(tile.textContent);
            
                if (tileValue > 2) {
                    const newValue = tileValue / 2;
                    const row = parseInt(arr[0]) - 1;
                    const col = parseInt(arr[1]) - 1;

                    self.GameManager.grid.cells[row][col].value = newValue;
                      // 更新 health 值
                    self.GameManager.grid.cells[row][col].health = newValue;
                    self.GameManager.prepareTiles();
                    self.GameManager.actuate();
                    // GameManager.storageManager.setGameState()
                    self.updateTileValue(tile, newValue);
                    self.updateTileHealth(tile, newHealth, newValue);
                }
            }
        }
    });
};

// 更新 tile 的健康值
halfCard.prototype.updateTileHealth = function (tile, health, value) {
    tile.healthBar.style.width = (health / value * 100) + "%"; // 根据健康值设置宽度
}

