// 主服务器
#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>
    #pragma comment(lib, "ws2_32.lib") // 链接到Winsock库
    typedef int socklen_t;
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
    #define closesocket close
    #define SOCKET int
    #define SOCKET_ERROR -1
    #define INVALID_SOCKET -1
#endif

#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <time.h>
#include <string>
#include <iostream>
#include <map>
#include <vector>
#include <algorithm>
#define LOGOUTPUT 0
using namespace std;
const int port = 2048;
#ifdef _WIN32
    WSADATA wsaData;
#endif
FILE *log = NULL;
struct ST
{
    string nid;  // 用户名
    string pswd; // 密码
    int score;   // 最高得分
    int score3d;
    int zombiescore;
    int winTimes;           // 双人对战获胜次数
    string lstime;          // 上次登录时间
    long long requireTimes; // 历史请求总数
};
ST person;
map<string, ST> mp;

struct MyCompare
{
    bool operator()(const map<string, ST>::iterator lhs, const map<string, ST>::iterator rhs) const
    {
        return (lhs->second.score + lhs->second.score3d + lhs->second.zombiescore + lhs->second.winTimes * 300) > (rhs->second.score + rhs->second.score3d + rhs->second.zombiescore + rhs->second.winTimes * 300); // 按分数降序排列
    }
};

bool cmp(const map<string, ST>::iterator lhs, const map<string, ST>::iterator rhs)
{
    return lhs->second.score > rhs->second.score;
}
vector<map<string, ST>::iterator> v;

struct MATCH
{
    string nid;
    string state;
    string opponent;
    int change, out, won;
    long long startTime; // 游戏开始时间戳（秒）
};
MATCH muser;
map<string, MATCH> mup;

long long waitSave = 0; // 用户信息是否有变化（待保存）
char head[128];         // database的表头
int requirefre[60];     // 存储请求频率
int assessfre[60];      // 存储访问频率
int lastcnttime;        // 上次计算请求频率的时间
int lastacnttime;       // 上次计算访问频率的时间
int requireFrequency;   // 每分钟请求的频率
int assessFrequency;    // 每分钟访问的频率

void setColor(UINT uFore, UINT uBack)
{
#ifdef _WIN32
    HANDLE handle = GetStdHandle(STD_OUTPUT_HANDLE);
    SetConsoleTextAttribute(handle, uFore + uBack * 0x10);
#else
    // Linux 下使用 ANSI 颜色代码
    // 简化处理：只设置前景色
    const char* colors[] = {
        "\033[30m", "\033[34m", "\033[32m", "\033[36m",
        "\033[31m", "\033[35m", "\033[33m", "\033[37m",
        "\033[90m", "\033[94m", "\033[92m", "\033[96m",
        "\033[91m", "\033[95m", "\033[93m", "\033[97m"
    };
    if (uFore < 16) {
        printf("%s", colors[uFore]);
    }
#endif
}

char *getTime()
{
    time_t timep;
    struct tm *p;
    static char timee[20];
    time(&timep);
    p = gmtime(&timep);
    sprintf(timee, "%d.%d.%d %d:%d:%d", 1900 + p->tm_year, 1 + p->tm_mon, p->tm_mday, 8 + p->tm_hour, p->tm_min, p->tm_sec);
    return timee;
}

int sendHTTP(int connfd, char *path, int sentTimes)
{
    if (sentTimes == 0)
    {
        char buf[520] = "HTTP/1.1 200 ok\r\nconnection: close\r\n\r\n"; // HTTP响应
        int s = send(connfd, buf, strlen(buf), 0);                      // 发送响应
    }
    if (path[0] == '\0')
        sprintf(path, "home.html");
    printf("发送 %s ", path);
    fprintf(log, "发送 %s ", path);
    FILE *fp = fopen(path, "rb");
    if (fp == NULL)
    {
        setColor(4, 0);
        perror("未能打开文件");
        fprintf(log, "未能打开文件 ! ");
        setColor(7, 0);
        if (sentTimes == 0)
            return sendHTTP(connfd, (char *)"home.html", 1);
    }

    char buffer[1024];
    size_t bytesRead;
    while ((bytesRead = fread(buffer, 1, sizeof(buffer), fp)) > 0)
    {
        send(connfd, buffer, bytesRead, 0);
    }
    fclose(fp);
    return 1;
}

int sendback(char *data, int connfd)
{
    printf("%s\n", data);
    fprintf(log, "%s\n", data);
    char buf[520] = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n"; // text响应
    int s = send(connfd, buf, strlen(buf), 0);                             // 发送响应
    if (s == SOCKET_ERROR)
    {
        setColor(4, 0);
        perror("socket错误");
        fprintf(log, "socket错误");
        setColor(7, 0);
        return 0;
    }

    char id[16];
    memset(id, '\0', sizeof(id));
    char *pp = strchr(data, '=');
    strncpy(id, data, pp - data);
    if (strcmp(id, "name") == 0)
    {
        char *pp2 = strchr(data, ',');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        char *pp3 = strrchr(data, '=');
        char *pp4 = strchr(data, ';');
        char password[128];
        memset(password, '\0', sizeof(password));
        strncpy(password, pp3 + 1, pp4 - pp3 - 1);
        printf("用户名：%s  密码：%s\n", username, password);
        fprintf(log, "用户名：%s  密码：%s\n", username, password);
        map<string, ST>::iterator iter = mp.find(string(username));
        if (iter == mp.end())
        {
            setColor(4, 0);
            printf("该用户名未注册\n");
            fprintf(log, "该用户名未注册\n");
            setColor(7, 0);
            send(connfd, "unsign", 6, 0);
        }
        else
        {
            if (iter->second.pswd == password)
            {
                setColor(9, 0);
                printf("登录成功\n");
                fprintf(log, "登录成功\n");
                setColor(7, 0);
                char successVal[32];
                memset(successVal, '\0', sizeof(successVal));
                sprintf(successVal, "success%d", iter->second.score);
                send(connfd, successVal, strlen(successVal), 0);
                iter->second.lstime = string(getTime());
                iter->second.requireTimes++;
                waitSave++;
            }
            else
            {
                setColor(4, 0);
                printf("密码错误");
                fprintf(log, "密码错误");
                setColor(7, 0);
                send(connfd, "fail", 4, 0);
            }
        }
    }
    else if (strcmp(id, "register") == 0)
    {
        char *pp2 = strchr(data, ',');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        char *pp3 = strrchr(data, '=');
        char *pp4 = strchr(data, ';');
        char password[128];
        memset(password, '\0', sizeof(password));
        strncpy(password, pp3 + 1, pp4 - pp3 - 1);
        printf("用户名：%s  密码：%s\n", username, password);
        fprintf(log, "用户名：%s  密码：%s\n", username, password);
        map<string, ST>::iterator iter = mp.find(string(username));
        if (iter == mp.end())
        {
            person.nid = string(username);
            person.pswd = string(password);
            person.score = 0;
            person.requireTimes = 1;
            auto it = mp.insert(pair<string, ST>(string(username), person));
            setColor(9, 0);
            printf("注册成功");
            fprintf(log, "注册成功");
            setColor(7, 0);
            send(connfd, "success", 7, 0);
            v.push_back(it.first);
            waitSave++;
        }
        else
        {
            setColor(4, 0);
            printf("该用户名已存在\n");
            fprintf(log, "该用户名已存在\n");
            setColor(7, 0);
            send(connfd, "repeition", 9, 0);
        }
    }
    else if (strcmp(id, "score") == 0)
    {
        char *pp2 = strchr(data, ',');
        char *pp3 = strrchr(data, '=');
        char *pp4 = strrchr(data, ';');
        char scorestr[16];
        char username[128];
        memset(scorestr, '\0', sizeof(scorestr));
        memset(username, '\0', sizeof(username));
        strncpy(scorestr, pp + 1, pp2 - pp - 1);
        int score = atoi(scorestr);
        strncpy(username, pp3 + 1, pp4 - pp3 - 1);
        printf("用户 %s 的分数为 %d\n", username, score);
        fprintf(log, "用户 %s 的分数为 %d\n", username, score);
        if (mp[string(username)].score < score)
        {
            mp[string(username)].score = score;
            waitSave++;
        }
        mp[string(username)].requireTimes++;
        send(connfd, "online", 6, 0);
    }
    else if (strcmp(id, "3dscore") == 0)
    {
        char *pp2 = strchr(data, ',');
        char *pp3 = strrchr(data, '=');
        char *pp4 = strrchr(data, ';');
        char scorestr[16];
        char username[128];
        memset(scorestr, '\0', sizeof(scorestr));
        memset(username, '\0', sizeof(username));
        strncpy(scorestr, pp + 1, pp2 - pp - 1);
        int score = atoi(scorestr);
        strncpy(username, pp3 + 1, pp4 - pp3 - 1);
        printf("用户 %s 的3d分数为 %d\n", username, score);
        fprintf(log, "用户 %s 的3d分数为 %d\n", username, score);
        if (mp.find(string(username)) != mp.end())
        {
            if (mp[string(username)].score3d < score)
            {
                mp[string(username)].score3d = score;
                waitSave++;
            }
            mp[string(username)].requireTimes++;
        }
    }
    else if (strcmp(id, "zombiescore") == 0)
    {
        char *pp2 = strchr(data, ',');
        char *pp3 = strrchr(data, '=');
        char *pp4 = strrchr(data, ';');
        char scorestr[16];
        char username[128];
        memset(scorestr, '\0', sizeof(scorestr));
        memset(username, '\0', sizeof(username));
        strncpy(scorestr, pp + 1, pp2 - pp - 1);
        int score = atoi(scorestr);
        strncpy(username, pp3 + 1, pp4 - pp3 - 1);
        printf("用户 %s 大战僵尸的分数为 %d\n", username, score);
        fprintf(log, "用户 %s 大战僵尸的分数为 %d\n", username, score);
        if (mp[string(username)].zombiescore < score)
        {
            mp[string(username)].zombiescore = score;
            waitSave++;
        }
        mp[string(username)].requireTimes++;
    }
    else if (strcmp(id, "save") == 0)
    {
        FILE *database = fopen("database.csv", "w"); // 打开数据库
        if (database == NULL)
        {
            setColor(4, 0);
            perror("未能打开文件database.csv,保存失败");
            fprintf(log, "未能打开文件database.csv,保存失败");
            setColor(7, 0);
            send(connfd, "write error", 11, 0);
        }
        else
        {
            fprintf(database, "%s", head);
            for (auto i = mp.begin(); i != mp.end(); i++)
            {
                fprintf(database, "%s,%s,%d,%s,%lld,%d,%d,%d\n", i->first.c_str(), i->second.pswd.c_str(), i->second.score, i->second.lstime.c_str(), i->second.requireTimes, i->second.winTimes, i->second.score3d, i->second.zombiescore);
            }
            send(connfd, "write", 5, 0);
            waitSave = 0;
            printf("写入数据成功！");
            fprintf(log, "写入数据成功！");
        }
        fclose(database);
    }
    else if (strcmp(id, "reread") == 0)
    {
        FILE *database = fopen("database.csv", "a+"); // 打开数据库
        if (database == NULL)
        {
            setColor(4, 0);
            perror("未能打开文件database.csv");
            fprintf(log, "未能打开文件database.csv");
            setColor(7, 0);
            send(connfd, "read error", 10, 0);
        }
        else
        {
            mp.clear();
            v.clear();
            char base[350];
            memset(base, '\0', sizeof(base));
            fgets(head, 299, database);
            while (fgets(base, 299, database)) // 读取用户信息
            {
                string s = base;
                person.nid = s.substr(0, s.find(','));
                s = s.substr(s.find(',') + 1);
                person.pswd = s.substr(0, s.find(','));
                s = s.substr(s.find(',') + 1);
                person.score = stoi(s.substr(0, s.find(',')));
                s = s.substr(s.find(',') + 1);
                person.lstime = s.substr(0, s.find(','));
                s = s.substr(s.find(',') + 1);
                person.requireTimes = stoll(s.substr(0, s.find(',')));
                s = s.substr(s.find(',') + 1);
                person.winTimes = stoi(s.substr(0, s.find(',')));
                s = s.substr(s.find(',') + 1);
                person.score3d = stoi(s.substr(0, s.find(',')));
                s = s.substr(s.find(',') + 1);
                person.zombiescore = stoi(s);
                auto it = mp.insert(pair<string, ST>(person.nid, person));
                v.push_back(it.first);
                memset(base, '\0', sizeof(base));
            }

            send(connfd, "read", 4, 0);
            waitSave = 0;
            printf("重新读取数据库成功！?");
            fprintf(log, "重新读取数据库成功！?");
        }
        fclose(database);
    }
    else if (strcmp(id, "waitsave") == 0)
    {
        char ws[256];
        memset(ws, '\0', sizeof(ws));
        sprintf(ws, "%lld,%d,%d,%d", waitSave, requireFrequency, assessFrequency, mup.size());
        send(connfd, ws, strlen(ws), 0);
        printf("%lld\n", waitSave);
        fprintf(log, "%lld\n", waitSave);
    }
    else if (strcmp(id, "getrank") == 0)
    {
        char *pp2 = strchr(data, ';');
        char ranknum[4];
        memset(ranknum, '\0', sizeof(ranknum));
        strncpy(ranknum, pp + 1, pp2 - pp - 1);
        sort(v.begin(), v.end(), cmp);
        char rankbuf[144];
        for (auto it = v.begin(); it != v.end(); it++) // 迭代vector<map<string,ST>::iterator>
        {
            if (it - v.begin() >= atoi(ranknum))
                break;
            memset(rankbuf, '\0', sizeof(rankbuf));
            sprintf(rankbuf, "%s,%d\n", (*it)->second.nid.c_str(), (*it)->second.score);
            send(connfd, rankbuf, strlen(rankbuf), 0);
            // printf("%s\n",rankbuf);
        }
    }
    else if (strcmp(id, "getwholerank") == 0)
    {
        char *pp2 = strchr(data, ',');
        char *pp3 = strrchr(data, '=');
        char *pp4 = strrchr(data, ';');
        char username[128];
        char ranknum[4];
        memset(ranknum, '\0', sizeof(ranknum));
        strncpy(ranknum, pp + 1, pp2 - pp - 1);
        memset(username, '\0', sizeof(username));
        strncpy(username, pp3 + 1, pp4 - pp3 - 1);
        if (mp.find(string(username)) != mp.end())
        {
            mp[string(username)].requireTimes++;
            waitSave++;
        }
        sort(v.begin(), v.end(), MyCompare());
        send(connfd, "%E6%8E%92%E5%90%8D,%E7%94%A8%E6%88%B7%E5%90%8D,%E7%BB%8F%E5%85%B8%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,3D%E6%A8%A1%E5%BC%8F%E5%88%86%E6%95%B0,2048%E5%A4%A7%E6%88%98%E5%83%B5%E5%B0%B8%E5%88%86%E6%95%B0,2%E4%BA%BA%E5%AF%B9%E6%88%98%E8%83%9C%E5%88%A9%E6%AC%A1%E6%95%B0,%E6%80%BB%E5%88%86,%E5%8F%82%E8%80%83%E5%80%BC\n", 312, 0);
        char rankbuf[256];
        for (auto it = v.begin(); it != v.end(); it++) // 迭代vector<map<string,ST>::iterator>
        {
            memset(rankbuf, '\0', sizeof(rankbuf));
            long long sumScore = (*it)->second.score + (*it)->second.winTimes * 300 + (*it)->second.score3d + (*it)->second.zombiescore;
            sprintf(rankbuf, "%d,%s,%d,%d,%d,%d,%lld,%lld\n", it - v.begin() + 1, strcmp(username, (*it)->second.nid.c_str()) == 0 ? ((*it)->second.nid + "(you)").c_str() : (*it)->second.nid.c_str(), (*it)->second.score, (*it)->second.score3d, (*it)->second.zombiescore, (*it)->second.winTimes, sumScore, (*it)->second.requireTimes);
            send(connfd, rankbuf, strlen(rankbuf), 0);
            // printf("%s\n",rankbuf);
            if (it - v.begin() >= atoi(ranknum))
                break;
        }
    }
    else if (strcmp(id, "userdata") == 0)
    {
        char base[350];
        send(connfd, "username,password,classic score,3d score,zombie score,the time of last login,the sum of request,win times,sum score\n", 116, 0);
        for (auto it = mp.begin(); it != mp.end(); it++)
        {
            memset(base, '\0', sizeof(base));
            long long sumScore = it->second.score + it->second.winTimes * 300 + it->second.score3d + it->second.zombiescore;
            sprintf(base, "%s,%s,%d,%d,%d,%s,%lld,%d,%lld\n", it->first.c_str(), it->second.pswd.c_str(), it->second.score, it->second.score3d, it->second.zombiescore, it->second.lstime.c_str(), it->second.requireTimes, it->second.winTimes, sumScore);
            send(connfd, base, strlen(base), 0);
        }
    }
    else if (strcmp(id, "gamestate") == 0)
    {
        char *pp2 = strrchr(data, ',');
        char *pp3 = strrchr(data, '=');
        char *pp4 = strrchr(data, ';');
        char username[128];
        char userstate[1500];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp3 + 1, pp4 - pp3 - 1);
        memset(userstate, '\0', sizeof(userstate));
        strncpy(userstate, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            if (strcmp(userstate, "unchange") == 0)
            {
                printf("用户 %s 的游戏状态未改变\n", username);
                fprintf(log, "用户 %s 的游戏状态未改变\n", username);
            }
            else
            {
                mup[string(username)].state = userstate;
                printf("用户 %s 的游戏状态改变为 %s\n", username, userstate);
                fprintf(log, "用户 %s 的游戏状态改变为 %s\n", username, userstate);
                mup[string(username)].change = 1;
            }
            if (mup.find(string(mup[string(username)].opponent)) == mup.end())
            { // 对方的分高
                mup.erase(string(username));
                printf("用户 %s 在联机中被打败\n", username);
                fprintf(log, "用户 %s 在联机中被打败\n", username);
                mp[string(username)].requireTimes++;
            }
            else if (mup[string(mup[string(username)].opponent)].change)
            {
                send(connfd, mup[string(mup[string(username)].opponent)].state.c_str(), strlen(mup[string(mup[string(username)].opponent)].state.c_str()), 0);
                mup[string(mup[string(username)].opponent)].change = 0;
                printf("发送 %s 的游戏状态\n", mup[string(username)].opponent);
                fprintf(log, "发送 %s 的游戏状态\n", mup[string(username)].opponent);
            }
            else if (mup[string(mup[string(username)].opponent)].out == 1)
            {
                send(connfd, "opponentout", 11, 0);
                printf("用户 %s 在联机中取胜\n", username);
                fprintf(log, "用户 %s 在联机中取胜\n", username);
                mp[string(username)].winTimes++;

                mup.erase(mup[string(username)].opponent);
                mup.erase(string(username));
            }
            else if (mup[string(mup[string(username)].opponent)].won == -1)
            {
                send(connfd, "opponentlost", 12, 0);
                printf("用户 %s 在联机中获胜\n", username);
                fprintf(log, "用户 %s 在联机中获胜\n", username);
                mp[string(username)].winTimes++;

                mup.erase(mup[string(username)].opponent);
                mup.erase(string(username));
            }
            else if (mup[string(mup[string(username)].opponent)].won == 1)
            {
                send(connfd, "opponentwon", 11, 0);
                printf("用户 %s 在联机中被打败\n", username);
                fprintf(log, "用户 %s 在联机中被打败\n", username);
                if (mp.find(mup[string(username)].opponent) != mp.end())
                {
                    mp[mup[string(username)].opponent].winTimes++;
                }
                mup.erase(mup[string(username)].opponent);
                mup.erase(string(username));
            }
        }
        else
        {
            printf("异常用户 %s 在联机中获胜\n", username);
            fprintf(log, "异常用户 %s 在联机中获胜\n", username);
        }
        if (mp.find(string(username)) != mp.end())
        {
            mp[string(username)].requireTimes++;
        }
    }
    else if (strcmp(id, "multilogin") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mp.find(string(username)) == mp.end())
        {
            send(connfd, "unsigned", 8, 0);
            printf("未注册的用户 %s\n", username);
            fprintf(log, "未注册的用户 %s\n", username);
        }
        else
        {
            if (mup.size() <= 6)
            {
                muser.nid = username;
                muser.out = 0;
                muser.won = 0;
                muser.change = 0;
                muser.state = "";
                muser.opponent = "none";
                muser.startTime = 0; // 初始化开始时间为0
                if (mup.find(string(username)) == mup.end())
                {
                    mup[string(username)] = muser;
                }
                else if (mup.find(mup[string(username)].opponent) != mup.end())
                {
                    mup[mup[string(username)].opponent].change = 1;
                }
                send(connfd, "success", 7, 0);
                printf("%s 已进入联机%d号\n", username, mup.size());
                fprintf(log, "%s 已进入联机%d号\n", username, mup.size());
            }
            else
            {
                send(connfd, "fail", 4, 0);
                printf("%s 进入联机失败", username);
                fprintf(log, "%s 进入联机失败", username);
            }
            mp[string(username)].requireTimes++;
        }
    }
    else if (strcmp(id, "getopponent") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        bool got = 0;
        for (auto it = mup.begin(); it != mup.end(); it++)
        {
            if (strcmp(it->second.opponent.c_str(), username) == 0)
            {
                send(connfd, it->first.c_str(), strlen(it->first.c_str()), 0);
                mup[string(username)].opponent = it->first;
                printf("%s 和 %s 组队", username, it->first.c_str());
                fprintf(log, "%s 和 %s 组队", username, it->first.c_str());
                got = 1;
            }
        }
        if (got == 0)
        {
            for (auto it = mup.begin(); it != mup.end(); it++)
            {
                if (it->second.opponent == "none" && strcmp(it->first.c_str(), username) != 0)
                {
                    send(connfd, it->first.c_str(), strlen(it->first.c_str()), 0);
                    it->second.opponent = username;
                    mup[string(username)].opponent = it->first;
                    // 设置游戏开始时间（匹配成功时）
                    time_t now = time(NULL);
                    it->second.startTime = now;
                    mup[string(username)].startTime = now;
                    printf("%s 和 %s 组队，游戏开始时间：%lld", username, it->first.c_str(), (long long)now);
                    fprintf(log, "%s 和 %s 组队，游戏开始时间：%lld", username, it->first.c_str(), (long long)now);
                    got = 1;
                }
            }
        }

        if (got == 0)
        {
            send(connfd, "[wa][it]", 8, 0);
            printf("%s 等待组队中", username);
            fprintf(log, "%s 等待组队中", username);
        }
        if (mp.find(string(username)) != mp.end())
        {
            mp[string(username)].requireTimes++;
        }
    }
    else if (strcmp(id, "goout") == 0) // 用户退出联机
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            // 标记自己退出，但暂时不删除记录，让对手能检测到
            mup[string(username)].out = 1;
            printf("%s 退出联机模式（标记为认输）\n", username);
            fprintf(log, "%s 退出联机模式（标记为认输）\n", username);
            
            // 如果没有对手（还在等待匹配），直接删除
            if (mup[string(username)].opponent == "none")
            {
                mup.erase(string(username));
            }
            // 否则保留记录，让对手下次同步时检测到 opponent.out == 1
            
            mp[string(username)].requireTimes++;
        }
        else
        {
            setColor(4, 0);
            printf("%s 不正常的用户退出联机模式\n", username);
            setColor(7, 0);
            fprintf(log, "%s 不正常的用户退出联机模式\n", username);
        }
    }
    else if (strcmp(id, "game-over") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            printf("%s 在联机模式中失败\n", username);
            fprintf(log, "%s 在联机模式中失败\n", username);
            mup[string(username)].won = -1;
            mp[string(username)].requireTimes++;
        }
        else
        {
            setColor(4, 0);
            printf("异常用户 %s 在联机模式中失败\n", username);
            setColor(7, 0);
            fprintf(log, "异常用户 %s 在联机模式中失败\n", username);
        }
    }
    else if (strcmp(id, "game-won") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            printf("%s 在联机模式中挑战成功\n", username);
            fprintf(log, "%s 在联机模式中挑战成功\n", username);
            mup[string(username)].won = 1;
            mp[string(username)].requireTimes++;
        }
        else
        {
            setColor(4, 0);
            printf("异常用户 %s 在联机模式中挑战成功\n", username);
            setColor(7, 0);
            fprintf(log, "异常用户 %s 在联机模式中挑战成功\n", username);
        }
    }
    else if (strcmp(id, "timeout") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            // 通知对手时间到了（设置标记）
            string opponentName = mup[string(username)].opponent;
            if (opponentName != "none" && mup.find(opponentName) != mup.end())
            {
                mup[opponentName].won = 2; // 使用特殊值2表示"对手时间到"
                printf("%s 时间到，通知对手 %s\n", username, opponentName.c_str());
                fprintf(log, "%s 时间到，通知对手 %s\n", username, opponentName.c_str());
            }
            mup.erase(string(username));
        }
        printf("%s 在联机模式中时间到\n", username);
        fprintf(log, "%s 在联机模式中时间到\n", username);
    }
    else if (strcmp(id, "gettime") == 0)
    {
        char *pp2 = strrchr(data, ';');
        char username[128];
        memset(username, '\0', sizeof(username));
        strncpy(username, pp + 1, pp2 - pp - 1);
        if (mup.find(string(username)) != mup.end())
        {
            // 检查对手是否已时间到
            if (mup[string(username)].won == 2)
            {
                send(connfd, "TIMEOUT", 7, 0);
                printf("用户 %s 收到对手时间到的通知\n", username);
                fprintf(log, "用户 %s 收到对手时间到的通知\n", username);
                // 清理该用户
                mup.erase(string(username));
                return 1;
            }
            
            if (mup[string(username)].startTime == 0)
            {
                // 还没匹配成功
                send(connfd, "-1", 2, 0);
            }
            else
            {
                time_t now = time(NULL);
                long long elapsed = now - mup[string(username)].startTime;
                long long remaining = 120 - elapsed; // 120秒倒计时
                if (remaining < 0)
                    remaining = 0;
                char timebuf[16];
                memset(timebuf, '\0', sizeof(timebuf));
                sprintf(timebuf, "%lld", remaining);
                send(connfd, timebuf, strlen(timebuf), 0);
                printf("用户 %s 剩余时间：%lld 秒\n", username, remaining);
                fprintf(log, "用户 %s 剩余时间：%lld 秒\n", username, remaining);
            }
        }
        else
        {
            // 用户不在对战列表中，可能已被清理
            send(connfd, "ENDED", 5, 0);
            printf("用户 %s 请求时间，但对战已结束\n", username);
            fprintf(log, "用户 %s 请求时间，但对战已结束\n", username);
        }
    }
    else
    {
        send(connfd, "what?", 5, 0);
    }
    // send(connfd, "online\n", 7, 0);
    printf("数据发送成功\n");
    fprintf(log, "数据发送成功\n");
    return 1;
}
int main(int argc, char *argv[])
{
#ifdef _WIN32
    WSADATA wsaData;
    int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (iResult != 0)
    {
        setColor(4, 0);
        printf("WSAStartup failed with error: %d\n", iResult);
        fprintf(log, "时间 %s :\nWSAStartup failed with error: %d\n", getTime(), iResult);
        setColor(7, 0);
        return 1;
    }
#endif

    log = fopen("log", "a");
    FILE *database = fopen("database.csv", "a+"); // 打开数据库
    if (database == NULL)
    {
        setColor(4, 0);
        perror("未能打开文件database.csv");
        fprintf(log, "时间 %s :\n未能打开文件database.csv\n", getTime());
        setColor(7, 0);
    }
    char base[300];
    memset(base, '\0', sizeof(base));
    fgets(head, 299, database);
    while (fgets(base, 299, database)) // 读取用户信息
    {
        string s = base;
        person.nid = s.substr(0, s.find(','));
        s = s.substr(s.find(',') + 1);
        person.pswd = s.substr(0, s.find(','));
        s = s.substr(s.find(',') + 1);
        person.score = stoi(s.substr(0, s.find(',')));
        s = s.substr(s.find(',') + 1);
        person.lstime = s.substr(0, s.find(','));
        s = s.substr(s.find(',') + 1);
        person.requireTimes = stoll(s.substr(0, s.find(',')));
        s = s.substr(s.find(',') + 1);
        person.winTimes = stoi(s.substr(0, s.find(',')));
        s = s.substr(s.find(',') + 1);
        person.score3d = stoi(s.substr(0, s.find(',')));
        s = s.substr(s.find(',') + 1);
        person.zombiescore = stoi(s);
        auto it = mp.insert(pair<string, ST>(person.nid, person));
        v.push_back(it.first);
        memset(base, '\0', sizeof(base));
    }
    fclose(database);

    int sock;
    int connfd;
    struct sockaddr_in sever_address;
    memset(&sever_address, 0, sizeof(sever_address));
    sever_address.sin_family = AF_INET;
    sever_address.sin_addr.s_addr = INADDR_ANY;
    sever_address.sin_port = htons(port);
    sock = socket(AF_INET, SOCK_STREAM, 0);
    assert(sock >= 0);
    int ret = bind(sock, (struct sockaddr *)&sever_address, sizeof(sever_address));
    assert(ret != -1);
    ret = listen(sock, 1);
    assert(ret != -1);
    fprintf(log, "时间 %s :\n有请下一组 服务器启动成功\n", getTime());
    printf("有请下一组 服务器启动成功\n");
    printf("本服务器用于发送网页和处理数据\n");
    while (1)
    {
        struct sockaddr_in client;
        socklen_t client_addrlength = sizeof(client);
        connfd = accept(sock, (struct sockaddr *)&client, &client_addrlength);
        if (connfd < 0)
        {
            printf("errno\n");
        }
        else
        {
            char request[3072];
            recv(connfd, request, 3070, 0);
            request[strlen(request) + 1] = '\0';
            setColor(10, 0);
            if (LOGOUTPUT)
            {
                printf("\n%s", request);
                fprintf(log, "\n时间 %s :\n收到请求\n%s", getTime(), request);
            }
            else
            {
                printf("\n");
                fprintf(log, "\n时间 %s:\n", getTime());
            }
            setColor(7, 0);

            string timelin = getTime();
            int minute = stoi(timelin.substr(timelin.find(':') + 1, timelin.rfind(':') - timelin.find(':') - 1)); // 请求频率统计
            if (minute != lastcnttime)
            {
                requireFrequency = 0;
                for (int i = 0; i < 60; i++)
                {
                    requireFrequency += requirefre[i];
                    requirefre[i] = 0;
                }
                printf("请求频率：%d次/分\n", requireFrequency);
                fprintf(log, "请求频率：%d次/分\n", requireFrequency);
                lastcnttime = minute;
            }
            requirefre[stoi(timelin.substr(timelin.rfind(':') + 1))]++;
            printf("时间: %s\n", timelin.c_str());

            if (strncmp(request, "GET", 3) == 0) // 判断请求类型
            {
                printf("监听到GET请求!\n");
                fprintf(log, "监听到GET请求!\n");
                if (minute != lastacnttime) // 访问频率统计
                {
                    assessFrequency = 0;
                    for (int i = 0; i < 60; i++)
                    {
                        assessFrequency += assessfre[i];
                        assessfre[i] = 0;
                    }
                    printf("访问频率：%d次/分\n", assessFrequency);
                    fprintf(log, "访问频率：%d次/分\n", assessFrequency);
                    lastacnttime = minute;
                }
                assessfre[stoi(timelin.substr(timelin.rfind(':') + 1))]++;

                char path[512];
                memset(path, '\0', sizeof(path));
                char *pp = strstr(request, " HTTP");
                strncpy(path, request + 5, pp - request - 5);
                printf("请求内容: %s\n", path);
                fprintf(log, "请求内容: %s\n", path);
                char *can = strchr(path, '?');
                if (can != NULL) // 检测是否有传参
                {
                    *can = '\0';
                    printf("参数：%s\n", can + 1);
                    fprintf(log, "参数：%s\n", can + 1);
                }
                if (sendHTTP(connfd, path, 0)) // 发送
                {
                    printf("成功!\n");
                    fprintf(log, "成功!\n");
                }
                else
                {
                    printf("错误!\n");
                    fprintf(log, "错误!\n");
                }
            }
            else if (strncmp(request, "POST", 4) == 0)
            {
                printf("监听到POST请求!\n");
                fprintf(log, "监听到POST请求!\n");
                char gotdata[3000];
                memset(gotdata, '\0', sizeof(gotdata));
                char *pp = strstr(request, " HTTP");
                strncpy(gotdata, request + 6, pp - request - 6);
                sendback(gotdata, connfd);
            }
            else if (strncmp(request, "HEAD", 4) == 0)
            {
                printf("监听到HEAD请求!\n");
                fprintf(log, "监听到HEAD请求!\n");
                char buf[128] = "HTTP/1.1 200 ok\r\nconnection: close\r\n\r\n";
                int s = send(connfd, buf, strlen(buf), 0);
            }
            closesocket(connfd);
        }
        if (waitSave > 20)
        {
            FILE *database = fopen("database.csv", "w"); // 打开数据库
            if (database == NULL)
            {
                setColor(4, 0);
                perror("未能打开文件database.csv,保存失败");
                fprintf(log, "未能打开文件database.csv,保存失败");
                setColor(7, 0);
                send(connfd, "write error", 11, 0);
            }
            else
            {
                fprintf(database, "%s", head);
                for (auto i = mp.begin(); i != mp.end(); i++)
                {
                    fprintf(database, "%s,%s,%d,%s,%lld,%d,%d,%d\n", i->first.c_str(), i->second.pswd.c_str(), i->second.score, i->second.lstime.c_str(), i->second.requireTimes, i->second.winTimes, i->second.score3d, i->second.zombiescore);
                }
                send(connfd, "write", 5, 0);
                waitSave = 0;
                printf("自动写入数据成功！");
                fprintf(log, "自动写入数据成功！");
            }
            fclose(database);
        }
    }
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}