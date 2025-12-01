// 2048 游戏服务器 - Node.js 版本
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 2048;

// 中间件配置
// 客户端发送的是原始文本数据，需要接受所有类型并作为文本处理
app.use(bodyParser.text({ type: '*/*' }));
app.use(express.static(__dirname)); // 静态文件服务

// GET 请求处理 - 根路径重定向到主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// GET 请求处理 - 自动添加 .html 扩展名
app.get('*', (req, res, next) => {
    // 如果是 POST 请求或已有扩展名，跳过
    if (req.method !== 'GET') {
        return next();
    }
    
    const requestPath = req.path;
    
    // 如果已经有扩展名（包含 . 且不是目录），使用 static 中间件
    if (path.extname(requestPath)) {
        return next();
    }
    
    // 尝试添加 .html 扩展名
    const htmlPath = path.join(__dirname, requestPath + '.html');
    
    fs.access(htmlPath, fs.constants.F_OK, (err) => {
        if (!err) {
            // 文件存在，发送它
            res.sendFile(htmlPath);
        } else {
            // 文件不存在，继续到下一个中间件（可能是静态文件或404）
            next();
        }
    });
});

// 数据结构
const mp = new Map(); // 用户数据 Map<username, UserData>
const mup = new Map(); // 联机对战数据 Map<username, MatchData>
let v = []; // 排行榜数组
let waitSave = 0; // 待保存的更改数
let head = ''; // CSV 表头

// 请求和访问频率统计
const requirefre = new Array(60).fill(0);
const assessfre = new Array(60).fill(0);
let lastcnttime = -1;
let lastacnttime = -1;
let requireFrequency = 0;
let assessFrequency = 0;

// 日志文件
const logStream = fs.createWriteStream('log', { flags: 'a' });

// 工具函数
function getTime() {
    const now = new Date();
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
}

function log(message) {
    //const time = getTime();
    // console.log(message); // 已禁用控制台输出
    //logStream.write(`时间 ${time}:\n${message}\n`);// 已禁用日志文件输出
}

function setColor(color) {
    // Node.js 控制台颜色（简化版）
    const colors = {
        reset: '\x1b[0m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        cyan: '\x1b[36m'
    };
    return colors[color] || colors.reset;
}

// 加载数据库
function loadDatabase() {
    try {
        const data = fs.readFileSync('database.csv', 'utf-8');
        const lines = data.split('\n');
        
        if (lines.length > 0) {
            head = lines[0] + '\n';
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const parts = line.split(',');
                if (parts.length >= 8) {
                    const user = {
                        nid: parts[0],
                        pswd: parts[1],
                        score: parseInt(parts[2]) || 0,
                        lstime: parts[3],
                        requireTimes: parseInt(parts[4]) || 0,
                        winTimes: parseInt(parts[5]) || 0,
                        score3d: parseInt(parts[6]) || 0,
                        zombiescore: parseInt(parts[7]) || 0
                    };
                    mp.set(user.nid, user);
                    v.push(user.nid);
                }
            }
        }
        log(`数据库加载成功，共 ${mp.size} 个用户`);
    } catch (err) {
        log(`${setColor('red')}未能打开文件 database.csv: ${err.message}${setColor('reset')}`);
    }
}

// 保存数据库
function saveDatabase() {
    try {
        let content = head;
        mp.forEach((user, username) => {
            content += `${username},${user.pswd},${user.score},${user.lstime},${user.requireTimes},${user.winTimes},${user.score3d},${user.zombiescore}\n`;
        });
        fs.writeFileSync('database.csv', content, 'utf-8');
        waitSave = 0;
        log('数据库保存成功！');
        return true;
    } catch (err) {
        log(`${setColor('red')}保存数据库失败: ${err.message}${setColor('reset')}`);
        return false;
    }
}

// 频率统计
function updateFrequency() {
    const now = new Date();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    
    // 更新请求频率
    if (minute !== lastcnttime) {
        requireFrequency = requirefre.reduce((a, b) => a + b, 0);
        requirefre.fill(0);
        log(`请求频率：${requireFrequency}次/分`);
        lastcnttime = minute;
    }
    requirefre[second]++;
    
    // 更新访问频率
    if (minute !== lastacnttime) {
        assessFrequency = assessfre.reduce((a, b) => a + b, 0);
        assessfre.fill(0);
        log(`访问频率：${assessFrequency}次/分`);
        lastacnttime = minute;
    }
    assessfre[second]++;
}

// POST 请求处理
app.post('/*', (req, res) => {
    updateFrequency();
    
    // 客户端使用非标准方式：xhttp.open("POST", "data", true)
    // 数据实际在 URL 路径中，而不是 request body
    let data = req.url.substring(1); // 去掉开头的 /
    
    // URL 解码
    data = decodeURIComponent(data);
    
    log(`${setColor('cyan')}收到 POST 请求: ${data}${setColor('reset')}`);
    
    if (!data || typeof data !== 'string') {
        res.send('what?');
        return;
    }
    
    const parts = data.split('=');
    if (parts.length < 2) {
        res.send('what?');
        return;
    }
    
    const id = parts[0];
    const rest = parts.slice(1).join('=');
    
    // 路由处理
    switch (id) {
        case 'name':
            handleLogin(rest, res);
            break;
        case 'register':
            handleRegister(rest, res);
            break;
        case 'score':
            handleScore(rest, res);
            break;
        case '3dscore':
            handle3DScore(rest, res);
            break;
        case 'zombiescore':
            handleZombieScore(rest, res);
            break;
        case 'save':
            handleSave(res);
            break;
        case 'reread':
            handleReread(res);
            break;
        case 'waitsave':
            handleWaitSave(res);
            break;
        case 'getrank':
            handleGetRank(rest, res);
            break;
        case 'getwholerank':
            handleGetWholeRank(rest, res);
            break;
        case 'userdata':
            handleUserData(res);
            break;
        case 'gamestate':
            handleGameState(rest, res);
            break;
        case 'multilogin':
            handleMultiLogin(rest, res);
            break;
        case 'getopponent':
            handleGetOpponent(rest, res);
            break;
        case 'goout':
            handleGoOut(rest, res);
            break;
        case 'game-over':
            handleGameOver(rest, res);
            break;
        case 'game-won':
            handleGameWon(rest, res);
            break;
        case 'timeout':
            handleTimeout(rest, res);
            break;
        case 'gettime':
            handleGetTime(rest, res);
            break;
        default:
            res.send('what?');
    }
});

// 登录处理
function handleLogin(data, res) {
    const [userPass, password] = data.split(',password=');
    const username = userPass;
    const pwd = password.replace(';', '');
    
    log(`用户名：${username}  密码：${pwd}`);
    
    const user = mp.get(username);
    if (!user) {
        log(`${setColor('red')}该用户名未注册${setColor('reset')}`);
        res.send('unsign');
    } else if (user.pswd === pwd) {
        log(`${setColor('green')}登录成功${setColor('reset')}`);
        res.send(`success${user.score}`);
        user.lstime = getTime();
        user.requireTimes++;
        waitSave++;
    } else {
        log(`${setColor('red')}密码错误${setColor('reset')}`);
        res.send('fail');
    }
}

// 注册处理
function handleRegister(data, res) {
    const [userPass, password] = data.split(',password=');
    const username = userPass;
    const pwd = password.replace(';', '');
    
    log(`注册 - 用户名：${username}  密码：${pwd}`);
    
    if (mp.has(username)) {
        log(`${setColor('red')}该用户名已存在${setColor('reset')}`);
        res.send('repeition');
    } else {
        const newUser = {
            nid: username,
            pswd: pwd,
            score: 0,
            lstime: getTime(),
            requireTimes: 1,
            winTimes: 0,
            score3d: 0,
            zombiescore: 0
        };
        mp.set(username, newUser);
        v.push(username);
        log(`${setColor('green')}注册成功${setColor('reset')}`);
        res.send('success');
        waitSave++;
    }
}

// 分数处理
function handleScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 的分数为 ${score}`);
    
    const user = mp.get(username);
    if (user) {
        if (user.score < score) {
            user.score = score;
            waitSave++;
        }
        user.requireTimes++;
    }
    res.send('online');
}

// 3D分数处理
function handle3DScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 的3D分数为 ${score}`);
    
    const user = mp.get(username);
    if (user) {
        if (user.score3d < score) {
            user.score3d = score;
            waitSave++;
        }
        user.requireTimes++;
    }
    res.send('online');
}

// 僵尸分数处理
function handleZombieScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 大战僵尸的分数为 ${score}`);
    
    const user = mp.get(username);
    if (user) {
        if (user.zombiescore < score) {
            user.zombiescore = score;
            waitSave++;
        }
        user.requireTimes++;
    }
    res.send('online');
}

// 保存处理
function handleSave(res) {
    if (saveDatabase()) {
        res.send('write');
    } else {
        res.send('write error');
    }
}

// 重新读取处理
function handleReread(res) {
    mp.clear();
    v = [];
    loadDatabase();
    res.send('read');
}

// 待保存数据查询
function handleWaitSave(res) {
    res.send(`${waitSave},${requireFrequency},${assessFrequency},${mup.size}`);
    log(`待保存: ${waitSave}`);
}

// 获取排行榜
function handleGetRank(data, res) {
    const ranknum = parseInt(data.replace(';', ''));
    
    const sorted = Array.from(mp.values()).sort((a, b) => b.score - a.score);
    
    let result = '';
    for (let i = 0; i < Math.min(ranknum, sorted.length); i++) {
        result += `${sorted[i].nid},${sorted[i].score}\n`;
    }
    res.send(result);
}

// 获取完整排行榜
function handleGetWholeRank(data, res) {
    const [ranknumStr, userPart] = data.split(',name=');
    const ranknum = parseInt(ranknumStr);
    const username = userPart.replace(';', '');
    
    const user = mp.get(username);
    if (user) {
        user.requireTimes++;
        waitSave++;
    }
    
    const sorted = Array.from(mp.entries()).map(([name, data]) => ({
        name,
        ...data,
        totalScore: data.score + data.score3d + data.zombiescore + data.winTimes * 300
    })).sort((a, b) => b.totalScore - a.totalScore);
    
    let result = '%E6%8E%92%E5%90%8D,%E7%94%A8%E6%88%B7%E5%90%8D,%E7%BB%8F%E5%85%B8%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,3D%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,2048%E5%A4%A7%E6%88%98%E5%83%B5%E5%B0%B8%E5%88%86%E6%95%B0,2%E4%BA%BA%E5%AF%B9%E6%88%98%E8%83%9C%E5%88%A9%E6%AC%A1%E6%95%B0,%E6%80%BB%E5%88%86,%E5%8F%82%E8%80%83%E5%80%BC\n';
    
    for (let i = 0; i < Math.min(ranknum, sorted.length); i++) {
        const item = sorted[i];
        const displayName = item.name === username ? `${item.name}(you)` : item.name;
        result += `${i + 1},${displayName},${item.score},${item.score3d},${item.zombiescore},${item.winTimes},${item.totalScore},${item.requireTimes}\n`;
    }
    res.send(result);
}

// 获取所有用户数据
function handleUserData(res) {
    let result = 'username,password,classic score,3d score,zombie score,the time of last login,the sum of request,win times,sum score\n';
    
    mp.forEach((user, username) => {
        const sumScore = user.score + user.score3d + user.zombiescore + user.winTimes * 300;
        result += `${username},${user.pswd},${user.score},${user.score3d},${user.zombiescore},${user.lstime},${user.requireTimes},${user.winTimes},${sumScore}\n`;
    });
    
    res.send(result);
}

// 游戏状态同步
function handleGameState(data, res) {
    const [stateStr, userPart] = data.split(',name=');
    const userstate = stateStr;
    const username = userPart.replace(';', '');
    
    const match = mup.get(username);
    if (!match) {
        log(`异常用户 ${username} 在联机中`);
        const user = mp.get(username);
        if (user) user.requireTimes++;
        res.send('');
        return;
    }
    
    if (userstate !== 'unchange') {
        match.state = userstate;
        match.change = 1;
        log(`用户 ${username} 的游戏状态改变`);
    }
    
    const opponent = mup.get(match.opponent);
    
    if (!opponent) {
        mup.delete(username);
        log(`用户 ${username} 在联机中被打败`);
        const user = mp.get(username);
        if (user) user.requireTimes++;
        res.send('');
    } else if (opponent.change) {
        res.send(opponent.state);
        opponent.change = 0;
        log(`发送 ${match.opponent} 的游戏状态`);
    } else if (opponent.out === 1) {
        res.send('opponentout');
        log(`用户 ${username} 在联机中取胜`);
        const user = mp.get(username);
        if (user) {
            user.winTimes++;
            waitSave++;
        }
        mup.delete(match.opponent);
        mup.delete(username);
    } else if (opponent.won === -1) {
        res.send('opponentlost');
        log(`用户 ${username} 在联机中获胜`);
        const user = mp.get(username);
        if (user) {
            user.winTimes++;
            waitSave++;
        }
        mup.delete(match.opponent);
        mup.delete(username);
    } else if (opponent.won === 1) {
        res.send('opponentwon');
        log(`用户 ${username} 在联机中被打败`);
        const opponentUser = mp.get(match.opponent);
        if (opponentUser) {
            opponentUser.winTimes++;
            waitSave++;
        }
        mup.delete(match.opponent);
        mup.delete(username);
    } else {
        res.send('');
    }
    
    const user = mp.get(username);
    if (user) user.requireTimes++;
}

// 联机登录
function handleMultiLogin(data, res) {
    const username = data.replace(';', '');
    
    if (!mp.has(username)) {
        res.send('unsigned');
        log(`未注册的用户 ${username}`);
        return;
    }
    
    if (mup.size <= 6) {
        const match = mup.get(username) || {
            nid: username,
            state: '',
            opponent: 'none',
            change: 0,
            out: 0,
            won: 0,
            startTime: 0
        };
        mup.set(username, match);
        
        res.send('success');
        log(`${username} 已进入联机${mup.size}号`);
    } else {
        res.send('fail');
        log(`${username} 进入联机失败`);
    }
    
    const user = mp.get(username);
    if (user) user.requireTimes++;
}

// 获取对手
function handleGetOpponent(data, res) {
    const username = data.replace(';', '');
    let got = false;
    
    // 先检查是否有人已经选择了自己作为对手
    for (const [name, match] of mup.entries()) {
        if (match.opponent === username) {
            res.send(name);
            const myMatch = mup.get(username);
            if (myMatch) myMatch.opponent = name;
            log(`${username} 和 ${name} 组队`);
            got = true;
            break;
        }
    }
    
    // 如果没有，寻找一个没有对手的玩家
    if (!got) {
        for (const [name, match] of mup.entries()) {
            if (match.opponent === 'none' && name !== username) {
                res.send(name);
                match.opponent = username;
                const myMatch = mup.get(username);
                if (myMatch) {
                    myMatch.opponent = name;
                    // 设置游戏开始时间
                    const now = Math.floor(Date.now() / 1000);
                    match.startTime = now;
                    myMatch.startTime = now;
                }
                log(`${username} 和 ${name} 组队，游戏开始时间：${match.startTime}`);
                got = true;
                break;
            }
        }
    }
    
    if (!got) {
        res.send('[wa][it]');
        log(`${username} 等待组队中`);
    }
    
    const user = mp.get(username);
    if (user) user.requireTimes++;
}

// 退出联机
function handleGoOut(data, res) {
    const username = data.replace(';', '');
    
    const match = mup.get(username);
    if (match) {
        match.out = 1;
        log(`${username} 退出联机模式（标记为认输）`);
        
        // 如果没有对手，直接删除
        if (match.opponent === 'none') {
            mup.delete(username);
        }
        
        const user = mp.get(username);
        if (user) user.requireTimes++;
    } else {
        log(`${setColor('red')}${username} 不正常的用户退出联机模式${setColor('reset')}`);
    }
    
    res.send('online');
}

// 游戏失败
function handleGameOver(data, res) {
    const username = data.replace(';', '');
    
    const match = mup.get(username);
    if (match) {
        log(`${username} 在联机模式中失败`);
        match.won = -1;
        const user = mp.get(username);
        if (user) user.requireTimes++;
    } else {
        log(`${setColor('red')}异常用户 ${username} 在联机模式中失败${setColor('reset')}`);
    }
    
    res.send('online');
}

// 游戏胜利
function handleGameWon(data, res) {
    const username = data.replace(';', '');
    
    const match = mup.get(username);
    if (match) {
        log(`${username} 在联机模式中挑战成功`);
        match.won = 1;
        const user = mp.get(username);
        if (user) user.requireTimes++;
    } else {
        log(`${setColor('red')}异常用户 ${username} 在联机模式中挑战成功${setColor('reset')}`);
    }
    
    res.send('online');
}

// 时间到
function handleTimeout(data, res) {
    const username = data.replace(';', '');
    
    const match = mup.get(username);
    if (match) {
        const opponentName = match.opponent;
        if (opponentName !== 'none') {
            const opponent = mup.get(opponentName);
            if (opponent) {
                opponent.won = 2;
                log(`${username} 时间到，通知对手 ${opponentName}`);
            }
        }
        mup.delete(username);
    }
    log(`${username} 在联机模式中时间到`);
    res.send('online');
}

// 获取剩余时间
function handleGetTime(data, res) {
    const username = data.replace(';', '');
    
    const match = mup.get(username);
    if (!match) {
        res.send('ENDED');
        log(`用户 ${username} 请求时间，但对战已结束`);
        return;
    }
    
    // 检查对手是否已时间到
    if (match.won === 2) {
        res.send('TIMEOUT');
        log(`用户 ${username} 收到对手时间到的通知`);
        mup.delete(username);
        return;
    }
    
    if (match.startTime === 0) {
        res.send('-1');
    } else {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - match.startTime;
        let remaining = 120 - elapsed;
        if (remaining < 0) remaining = 0;
        res.send(remaining.toString());
        log(`用户 ${username} 剩余时间：${remaining} 秒`);
    }
}

// 定期自动保存
setInterval(() => {
    if (waitSave > 20) {
        saveDatabase();
    }
}, 10000); // 每10秒检查一次

// 启动服务器
loadDatabase();

app.listen(PORT, () => {
    log(`${setColor('green')}有请下一组 服务器启动成功${setColor('reset')}`);
    log(`本服务器用于发送网页和处理数据`);
    log(`服务器运行在端口 ${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
    log('正在关闭服务器...');
    if (waitSave > 0) {
        saveDatabase();
    }
    logStream.end();
    process.exit(0);
});
