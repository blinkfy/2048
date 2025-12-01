// 2048 游戏服务器 - Node.js 版本
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ensureDatabaseAndTables, getPool } = require('./db');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 2048;

const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 60 * 1000),
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 160),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ code: 1, msg: 'Too many requests (global rate limit)' })
});
// 中间件配置
// 客户端发送的是原始文本数据，需要接受所有类型并作为文本处理
app.use(bodyParser.text({ type: '*/*' }));
app.use(express.static(__dirname)); // 静态文件服务

// GET 请求处理 - 根路径重定向到主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// GET 请求处理 - 自动添加 .html 扩展名
app.get('*',globalLimiter, (req, res, next) => {
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
const mup = new Map(); // 联机对战数据 Map<username, MatchData>

// 请求和访问频率统计
const requirefre = new Array(60).fill(0);
const assessfre = new Array(60).fill(0);
let lastcnttime = -1;
let lastacnttime = -1;
let requireFrequency = 0;
let assessFrequency = 0;

// 日志文件（可选）
let logStream;

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

// Runtime DB/CSV hybrid helpers
// When DB is unavailable we operate on a CSV file `database.csv` in this folder.
const csvPath = path.join(__dirname, 'database.csv');
const mp = new Map(); // CSV in-memory store when DB offline (nid => user object)
let head = '';
let dbOnline = true; // runtime flag

function parseTimeStr(s) {
    // try to parse a time string like 'YYYY.M.D H:M:S', fallback to epoch 0
    try {
        // replace dots in date with '-' for Date parsing
        const fixed = s.replace(/\.(?=\d)/g, '-').replace(/\s+/g, ' ');
        const parts = fixed.split(' ');
        if (parts.length >= 2) {
            const d = parts[0].replace(/-/g, '/');
            return new Date(d + ' ' + parts[1]);
        }
        return new Date(s);
    } catch (e) {
        return new Date(0);
    }
}

function loadCsv() {
    try {
        const data = fs.readFileSync(csvPath, 'utf-8');
        const lines = data.split('\n');
        mp.clear();
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
                }
            }
        }
        return true;
    } catch (err) {
        // no CSV yet
        return false;
    }
}

function saveCsv() {
    try {
        let content = head || 'username,password,classic score,3d score,zombie score,the time of last login,the sum of request,win times\n';
        mp.forEach((user) => {
            content += `${user.nid},${user.pswd},${user.score},${user.lstime},${user.requireTimes},${user.winTimes},${user.score3d},${user.zombiescore}\n`;
        });
        // atomic write
        fs.writeFileSync(csvPath + '.tmp', content, 'utf-8');
        fs.renameSync(csvPath + '.tmp', csvPath);
        return true;
    } catch (err) {
        return false;
    }
}

async function syncDbToCsv() {
    // read full DB and persist to CSV snapshot
    try {
        const [rows] = await getPool().query('SELECT nid, pswd, score, lstime, requireTimes, winTimes, score3d, zombiescore FROM Users');
        mp.clear();
        rows.forEach(r => {
            mp.set(r.nid, {
                nid: r.nid,
                pswd: r.pswd,
                score: r.score || 0,
                lstime: r.lstime || '',
                requireTimes: r.requireTimes || 0,
                winTimes: r.winTimes || 0,
                score3d: r.score3d || 0,
                zombiescore: r.zombiescore || 0
            });
        });
        saveCsv();
    } catch (e) {
        // ignore
    }
}

async function mergeCsvToDb() {
    // merge CSV (mp) into DB, preserving monotonicity: take max for scores and counts, later lstime
    for (const [nid, csvUser] of mp.entries()) {
        try {
            const [rows] = await getPool().query('SELECT * FROM Users WHERE nid = ?', [nid]);
            const dbUser = rows[0];
            if (!dbUser) {
                // create user in DB using csv data
                await getPool().query(
                    'INSERT INTO Users (nid, pswd, score, lstime, requireTimes, winTimes, score3d, zombiescore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [csvUser.nid, csvUser.pswd || '', csvUser.score || 0, csvUser.lstime || '', csvUser.requireTimes || 0, csvUser.winTimes || 0, csvUser.score3d || 0, csvUser.zombiescore || 0]
                );
            } else {
                // merge fields: use max for numeric increasing fields, later time for lstime
                const merged = {};
                merged.score = Math.max(dbUser.score || 0, csvUser.score || 0);
                merged.score3d = Math.max(dbUser.score3d || 0, csvUser.score3d || 0);
                merged.zombiescore = Math.max(dbUser.zombiescore || 0, csvUser.zombiescore || 0);
                merged.requireTimes = Math.max(dbUser.requireTimes || 0, csvUser.requireTimes || 0);
                merged.winTimes = Math.max(dbUser.winTimes || 0, csvUser.winTimes || 0);
                // choose later lstime
                try {
                    const dbt = parseTimeStr(dbUser.lstime || '');
                    const csvt = parseTimeStr(csvUser.lstime || '');
                    merged.lstime = (dbt >= csvt) ? (dbUser.lstime || '') : (csvUser.lstime || '');
                } catch (e) {
                    merged.lstime = dbUser.lstime || csvUser.lstime || '';
                }
                // update DB
                const sets = [];
                const values = [];
                for (const k of ['score','score3d','zombiescore','requireTimes','winTimes','lstime']) {
                    sets.push(`${k} = ?`);
                    values.push(merged[k]);
                }
                values.push(nid);
                await getPool().query(`UPDATE Users SET ${sets.join(', ')} WHERE nid = ?`, values);
            }
        } catch (e) {
            // if any DB error, skip this user for now
            continue;
        }
    }
    // after successful merge attempt, refresh CSV from DB snapshot
    await syncDbToCsv();
}

async function startDbMonitor(intervalMs = 10000) {
    setInterval(async () => {
        try {
            await getPool().query('SELECT 1');
            if (!dbOnline) {
                // DB came back
                dbOnline = true;
                console.log('2048: DB available again, merging CSV -> DB');
                await mergeCsvToDb();
            }
        } catch (e) {
            if (dbOnline) {
                console.log('2048: DB became unavailable, switching to CSV mode');
            }
            dbOnline = false;
            // ensure CSV loaded so handlers can work
            loadCsv();
        }
    }, intervalMs);
}

// hybrid helpers used by handlers
async function getUser(username) {
    if (dbOnline) {
        try {
            const [rows] = await getPool().query('SELECT * FROM Users WHERE nid = ?', [username]);
            return rows[0] || null;
        } catch (e) {
            dbOnline = false;
            loadCsv();
            return mp.get(username) || null;
        }
    } else {
        return mp.get(username) || null;
    }
}

async function createUser(username, pwd, nowStr) {
    if (dbOnline) {
        try {
            await getPool().query(
                'INSERT INTO Users (nid, pswd, score, lstime, requireTimes, winTimes, score3d, zombiescore) VALUES (?, ?, 0, ?, 1, 0, 0, 0)',
                [username, pwd, nowStr]
            );
            // also sync snapshot
            await syncDbToCsv();
        } catch (e) {
            dbOnline = false;
            // fallthrough to csv create
        }
    }
    if (!dbOnline) {
        mp.set(username, { nid: username, pswd: pwd, score: 0, lstime: nowStr, requireTimes: 1, winTimes: 0, score3d: 0, zombiescore: 0 });
        saveCsv();
    }
}

async function updateUserFields(username, fields) {
    if (dbOnline) {
        try {
            const keys = Object.keys(fields);
            if (keys.length === 0) return;
            const sets = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => fields[k]);
            values.push(username);
            await getPool().query(`UPDATE Users SET ${sets} WHERE nid = ?`, values);
            await syncDbToCsv();
            return;
        } catch (e) {
            dbOnline = false;
            loadCsv();
        }
    }
    // csv mode
    const u = mp.get(username) || {};
    for (const k of Object.keys(fields)) {
        u[k] = fields[k];
    }
    u.nid = username;
    mp.set(username, u);
    saveCsv();
}

async function incrementField(username, field) {
    if (dbOnline) {
        try {
            await getPool().query(`UPDATE Users SET ${field} = ${field} + 1 WHERE nid = ?`, [username]);
            await syncDbToCsv();
            return;
        } catch (e) {
            dbOnline = false;
            loadCsv();
        }
    }
    const u = mp.get(username) || { nid: username, pswd: '', score: 0, lstime: '', requireTimes: 0, winTimes: 0, score3d: 0, zombiescore: 0 };
    u[field] = (u[field] || 0) + 1;
    mp.set(username, u);
    saveCsv();
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
async function handleLogin(data, res) {
    const [userPass, password] = data.split(',password=');
    const username = userPass;
    const pwd = password.replace(';', '');
    
    log(`用户名：${username}  密码：${pwd}`);
    
    const user = await getUser(username);
    if (!user) {
        log(`${setColor('red')}该用户名未注册${setColor('reset')}`);
        res.send('unsign');
    } else if (user.pswd === pwd) {
        log(`${setColor('green')}登录成功${setColor('reset')}`);
        res.send(`success${user.score}`);
        await updateUserFields(username, { lstime: getTime() });
        await incrementField(username, 'requireTimes');
    } else {
        log(`${setColor('red')}密码错误${setColor('reset')}`);
        res.send('fail');
    }
}

// 注册处理
async function handleRegister(data, res) {
    const [userPass, password] = data.split(',password=');
    const username = userPass;
    const pwd = password.replace(';', '');
    
    log(`注册 - 用户名：${username}  密码：${pwd}`);
    
    const existed = await getUser(username);
    if (existed) {
        log(`${setColor('red')}该用户名已存在${setColor('reset')}`);
        res.send('repeition');
    } else {
        await createUser(username, pwd, getTime());
        log(`${setColor('green')}注册成功${setColor('reset')}`);
        res.send('success');
    }
}

// 分数处理
async function handleScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 的分数为 ${score}`);
    
    const user = await getUser(username);
    if (user) {
        if ((user.score || 0) < score) {
            await updateUserFields(username, { score });
        }
        await incrementField(username, 'requireTimes');
    }
    res.send('online');
}

// 3D分数处理
async function handle3DScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 的3D分数为 ${score}`);
    
    const user = await getUser(username);
    if (user) {
        if ((user.score3d || 0) < score) {
            await updateUserFields(username, { score3d: score });
        }
        await incrementField(username, 'requireTimes');
    }
    res.send('online');
}

// 僵尸分数处理
async function handleZombieScore(data, res) {
    const [scoreStr, userPart] = data.split(',name=');
    const score = parseInt(scoreStr);
    const username = userPart.replace(';', '');
    
    log(`用户 ${username} 大战僵尸的分数为 ${score}`);
    
    const user = await getUser(username);
    if (user) {
        if ((user.zombiescore || 0) < score) {
            await updateUserFields(username, { zombiescore: score });
        }
        await incrementField(username, 'requireTimes');
    }
    res.send('online');
}

// 保存处理
function handleSave(res) { res.send('write'); }

// 重新读取处理
function handleReread(res) { res.send('read'); }

// 待保存数据查询
function handleWaitSave(res) { res.send(`0,${requireFrequency},${assessFrequency},${mup.size}`); }

// 获取排行榜
function handleGetRank(data, res) {
    const ranknum = parseInt(data.replace(';', ''));
    
    if (dbOnline) {
        getPool().query('SELECT nid, score FROM Users ORDER BY score DESC LIMIT ?', [ranknum])
            .then(([rows]) => {
                let result = '';
                for (const r of rows) result += `${r.nid},${r.score}\n`;
                res.send(result);
            })
            .catch(() => res.send(''));
    } else {
        // CSV mode: build ranking from mp
        try {
            const arr = Array.from(mp.values()).map(u => ({ nid: u.nid, score: u.score || 0 }));
            arr.sort((a, b) => b.score - a.score);
            let result = '';
            for (let i = 0; i < Math.min(ranknum, arr.length); i++) result += `${arr[i].nid},${arr[i].score}\n`;
            res.send(result);
        } catch (e) {
            res.send('');
        }
    }
}

// 获取完整排行榜
function handleGetWholeRank(data, res) {
    const [ranknumStr, userPart] = data.split(',name=');
    const ranknum = parseInt(ranknumStr);
    const username = userPart.replace(';', '');
    
    (async () => {
        const me = await getUser(username);
        if (me) await incrementField(username, 'requireTimes');
        if (dbOnline) {
            try {
                const [rows] = await getPool().query(
                    'SELECT nid as name, score, score3d, zombiescore, winTimes, requireTimes, (score + score3d + zombiescore + winTimes*300) as totalScore FROM Users ORDER BY totalScore DESC LIMIT ?',
                    [ranknum]
                );
                let result = '%E6%8E%92%E5%90%8D,%E7%94%A8%E6%88%B7%E5%90%8D,%E7%BB%8F%E5%85%B8%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,3D%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,2048%E5%A4%A7%E6%88%98%E5%83%B5%E5%B0%B8%E5%88%86%E6%95%B0,2%E4%BA%BA%E5%AF%B9%E6%88%98%E8%83%BC%E5%88%A9%E6%AC%A1%E6%95%B0,%E6%80%BB%E5%88%86,%E5%8F%82%E8%80%83%E5%80%BC\n';
                rows.forEach((item, i) => {
                    const displayName = item.name === username ? `${item.name}(you)` : item.name;
                    result += `${i + 1},${displayName},${item.score},${item.score3d},${item.zombiescore},${item.winTimes},${item.totalScore},${item.requireTimes}\n`;
                });
                res.send(result);
            } catch (e) {
                res.send('');
            }
        } else {
            // CSV mode: compute ranking from mp
            try {
                const arr = Array.from(mp.values()).map(u => ({
                    name: u.nid,
                    score: u.score || 0,
                    score3d: u.score3d || 0,
                    zombiescore: u.zombiescore || 0,
                    winTimes: u.winTimes || 0,
                    requireTimes: u.requireTimes || 0,
                    totalScore: (u.score || 0) + (u.score3d || 0) + (u.zombiescore || 0) + ((u.winTimes || 0) * 300)
                }));
                arr.sort((a, b) => b.totalScore - a.totalScore);
                let result = '%E6%8E%92%E5%90%8D,%E7%94%A8%E6%88%B7%E5%90%8D,%E7%BB%8F%E5%85%B8%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,3D%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,2048%E5%A4%A7%E6%88%98%E5%83%B5%E5%B0%B8%E5%88%86%E6%95%B0,2%E4%BA%BA%E5%AF%B9%E6%88%98%E8%83%BC%E5%88%A9%E6%AC%A1%E6%95%B0,%E6%80%BB%E5%88%86,%E5%8F%82%E8%80%83%E5%80%BC\n';
                for (let i = 0; i < Math.min(ranknum, arr.length); i++) {
                    const item = arr[i];
                    const displayName = item.name === username ? `${item.name}(you)` : item.name;
                    result += `${i + 1},${displayName},${item.score},${item.score3d},${item.zombiescore},${item.winTimes},${item.totalScore},${item.requireTimes}\n`;
                }
                res.send(result);
            } catch (e) {
                res.send('');
            }
        }
    })().catch(() => res.send(''));
}

// 获取所有用户数据
function handleUserData(res) {
    if (dbOnline) {
        getPool().query('SELECT *,(score+score3d+zombiescore+winTimes*300) as sumScore FROM Users')
            .then(([rows]) => {
                let out = 'username,password,classic score,3d score,zombie score,the time of last login,the sum of request,win times,sum score\n';
                rows.forEach(u => {
                    out += `${u.nid},${u.pswd},${u.score},${u.score3d},${u.zombiescore},${u.lstime},${u.requireTimes},${u.winTimes},${u.sumScore}\n`;
                });
                res.send(out);
            })
            .catch(() => res.send(''));
    } else {
        try {
            let out = 'username,password,classic score,3d score,zombie score,the time of last login,the sum of request,win times,sum score\n';
            mp.forEach(u => {
                const sumScore = (u.score || 0) + (u.score3d || 0) + (u.zombiescore || 0) + ((u.winTimes || 0) * 300);
                out += `${u.nid},${u.pswd},${u.score || 0},${u.score3d || 0},${u.zombiescore || 0},${u.lstime || ''},${u.requireTimes || 0},${u.winTimes || 0},${sumScore}\n`;
            });
            res.send(out);
        } catch (e) {
            res.send('');
        }
    }
}

// 游戏状态同步
function handleGameState(data, res) {
    const [stateStr, userPart] = data.split(',name=');
    const userstate = stateStr;
    const username = userPart.replace(';', '');
    
    const match = mup.get(username);
    if (!match) {
        log(`异常用户 ${username} 在联机中`);
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
        (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
        res.send('');
    } else if (opponent.change) {
        res.send(opponent.state);
        opponent.change = 0;
        log(`发送 ${match.opponent} 的游戏状态`);
    } else if (opponent.out === 1) {
        res.send('opponentout');
        log(`用户 ${username} 在联机中取胜`);
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'winTimes'); })();
        mup.delete(match.opponent);
        mup.delete(username);
    } else if (opponent.won === -1) {
        res.send('opponentlost');
        log(`用户 ${username} 在联机中获胜`);
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'winTimes'); })();
        mup.delete(match.opponent);
        mup.delete(username);
    } else if (opponent.won === 1) {
        res.send('opponentwon');
        log(`用户 ${username} 在联机中被打败`);
    (async () => { const ou = await getUser(match.opponent); if (ou) await incrementField(match.opponent, 'winTimes'); })();
        mup.delete(match.opponent);
        mup.delete(username);
    } else {
        res.send('');
    }
    
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
}

// 联机登录
async function handleMultiLogin(data, res) {
    const username = data.replace(';', '');
    
    const existed = await getUser(username);
    if (!existed) {
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
    
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
    
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
        
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
    (async () => { const u = await getUser(username); if (u) await incrementField(username, 'requireTimes'); })();
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
// 移除周期性 CSV 保存

// 启动服务器（初始化数据库和表）
// Don't block server start on DB availability. Start DB monitor which will keep CSV synced.
ensureDatabaseAndTables().then(() => {
    console.log('2048 数据库初始化完成');
    // initial sync from DB to CSV if DB available
    (async () => { try { await syncDbToCsv(); } catch (e) {} })();
}).catch((e) => {
    console.error('2048 数据库初始化失败', e);
});

// Ensure CSV loaded so offline mode works immediately
loadCsv();

// start DB monitor which will flip dbOnline and merge when DB recovers
startDbMonitor(10000);

app.listen(PORT, () => {
    log(`${setColor('green')}有请下一组 服务器启动成功${setColor('reset')}`);
    log(`本服务器用于发送网页和处理数据`);
    log(`服务器运行在端口 ${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
    log('正在关闭服务器...');
    try { if (logStream) logStream.end(); } catch (e) {}
    process.exit(0);
});
