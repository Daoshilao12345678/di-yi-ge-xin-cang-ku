// ============================================
// 🍅 番茄钟 - 核心逻辑
// ============================================

// ---- DOM 引用 ----
const DOM = {
    // 计时器
    minutes: document.getElementById('timerMinutes'),
    seconds: document.getElementById('timerSeconds'),
    sep: document.querySelector('.timer-sep'),
    status: document.getElementById('timerStatus'),
    progressBar: document.querySelector('.progress-bar'),
    ring: document.querySelector('.timer-ring'),

    // 控制
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resetBtn: document.getElementById('resetBtn'),
    skipBtn: document.getElementById('skipBtn'),

    // 模式
    modeBtns: document.querySelectorAll('.mode-btn'),

    // 计数
    completedCount: document.getElementById('completedCount'),
    countDots: document.getElementById('countDots'),

    // 任务
    taskInput: document.getElementById('taskInput'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    taskList: document.getElementById('taskList'),
    taskProgress: document.getElementById('taskProgress'),

    // 弹窗
    statsModal: document.getElementById('statsModal'),
    statsToggle: document.getElementById('statsToggle'),
    statsClose: document.getElementById('statsClose'),
    statToday: document.getElementById('statToday'),
    statWeek: document.getElementById('statWeek'),
    statTotal: document.getElementById('statTotal'),
    statFocusTime: document.getElementById('statFocusTime'),
    statChart: document.getElementById('statChart'),
    resetStatsBtn: document.getElementById('resetStatsBtn'),

    settingsModal: document.getElementById('settingsModal'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsClose: document.getElementById('settingsClose'),
    settingPomodoro: document.getElementById('settingPomodoro'),
    settingShortBreak: document.getElementById('settingShortBreak'),
    settingLongBreak: document.getElementById('settingLongBreak'),
    settingLongInterval: document.getElementById('settingLongInterval'),
    settingNotification: document.getElementById('settingNotification'),
    settingSound: document.getElementById('settingSound'),
    settingAutoStart: document.getElementById('settingAutoStart'),
    saveSettings: document.getElementById('saveSettings'),

    themeToggle: document.getElementById('themeToggle'),
};

// ---- 状态 ----
const STATE = {
    mode: 'pomodoro',       // pomodoro | shortBreak | longBreak
    timer: null,            // setInterval ID
    timeLeft: 25 * 60,      // 剩余秒数
    totalTime: 25 * 60,     // 当前阶段总秒数
    isRunning: false,
    completedPomodoros: 0,  // 今日完成的番茄数
    currentStreak: 0,       // 连续番茄（用于长休息判断）
};

// ---- 默认设置 ----
const DEFAULTS = {
    pomodoro: 25,
    shortBreak: 5,
    longBreak: 15,
    longInterval: 4,
    notification: true,
    sound: true,
    autoStart: false,
};

// ---- 工具函数 ----
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return {
        m: m.toString().padStart(2, '0'),
        s: s.toString().padStart(2, '0'),
    };
}

function getSettings() {
    try {
        const raw = localStorage.getItem('pomodoro_settings');
        if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULTS };
}

function saveSettingsToStorage(settings) {
    localStorage.setItem('pomodoro_settings', JSON.stringify(settings));
}

function getStats() {
    try {
        const raw = localStorage.getItem('pomodoro_stats');
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { daily: {}, total: 0, weekly: {} };
}

function saveStatsToStorage(stats) {
    localStorage.setItem('pomodoro_stats', JSON.stringify(stats));
}

function getTasks() {
    try {
        const raw = localStorage.getItem('pomodoro_tasks');
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
}

function saveTasksToStorage(tasks) {
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getWeekKey(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().slice(0, 10);
}

function playSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, duration, startTime) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        // 三个上升音阶的提示音
        playTone(523, 0.15, ctx.currentTime);        // C5
        playTone(659, 0.15, ctx.currentTime + 0.15);  // E5
        playTone(784, 0.3, ctx.currentTime + 0.3);    // G5
    } catch (_) {}
}

function sendNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '🍅' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// ---- 倒计时逻辑 ----
function getModeDuration(mode) {
    const settings = getSettings();
    switch (mode) {
        case 'pomodoro': return settings.pomodoro * 60;
        case 'shortBreak': return settings.shortBreak * 60;
        case 'longBreak': return settings.longBreak * 60;
        default: return 25 * 60;
    }
}

function updateDisplay() {
    const { m, s } = formatTime(STATE.timeLeft);
    DOM.minutes.textContent = m;
    DOM.seconds.textContent = s;

    // 环形进度
    const circumference = 911;
    const progress = STATE.timeLeft / STATE.totalTime;
    const offset = circumference * (1 - progress);
    DOM.progressBar.style.strokeDashoffset = offset;
}

function updateStatus() {
    const labels = {
        pomodoro: '🎯 专注时间',
        shortBreak: '☕ 休息一下',
        longBreak: '🌿 长休息时间',
    };
    if (STATE.isRunning) {
        DOM.status.textContent = labels[STATE.mode] || '工作中...';
    } else if (STATE.timeLeft === STATE.totalTime) {
        DOM.status.textContent = '准备就绪';
    } else {
        DOM.status.textContent = '已暂停';
    }
}

function tick() {
    if (STATE.timeLeft <= 0) {
        // 时间到了！
        clearInterval(STATE.timer);
        STATE.timer = null;
        STATE.isRunning = false;
        DOM.startBtn.style.display = 'inline-block';
        DOM.pauseBtn.style.display = 'none';
        onTimerComplete();
        return;
    }
    STATE.timeLeft--;
    updateDisplay();

    // 闪烁冒号
    DOM.sep.classList.toggle('hidden', STATE.timeLeft % 2 === 0);
}

function startTimer() {
    if (STATE.isRunning) return;
    if (STATE.timeLeft <= 0) {
        // 如果已经归零，进入下一阶段
        onTimerComplete();
        return;
    }
    STATE.isRunning = true;
    DOM.startBtn.style.display = 'none';
    DOM.pauseBtn.style.display = 'inline-block';
    updateStatus();
    STATE.timer = setInterval(tick, 1000);
}

function pauseTimer() {
    if (!STATE.isRunning) return;
    clearInterval(STATE.timer);
    STATE.timer = null;
    STATE.isRunning = false;
    DOM.startBtn.style.display = 'inline-block';
    DOM.pauseBtn.style.display = 'none';
    DOM.sep.classList.remove('hidden');
    updateStatus();
}

function resetTimer() {
    clearInterval(STATE.timer);
    STATE.timer = null;
    STATE.isRunning = false;
    STATE.timeLeft = STATE.totalTime;
    DOM.startBtn.style.display = 'inline-block';
    DOM.pauseBtn.style.display = 'none';
    DOM.sep.classList.remove('hidden');
    updateDisplay();
    updateStatus();
}

function onTimerComplete() {
    // 播放提示音 + 通知
    const settings = getSettings();
    if (settings.sound) playSound();
    if (settings.notification) {
        const names = { pomodoro: '专注', shortBreak: '短休息', longBreak: '长休息' };
        sendNotification('🍅 番茄钟', `${names[STATE.mode]}已完成！`);
    }

    if (STATE.mode === 'pomodoro') {
        // 完成一个番茄
        STATE.completedPomodoros++;
        STATE.currentStreak++;
        updatePomodoroCount();
        saveDailyStats();
        updateStatsDisplay();

        // 判断下一个是短休还是长休
        const nextMode = (STATE.currentStreak % getSettings().longInterval === 0)
            ? 'longBreak' : 'shortBreak';
        switchMode(nextMode);
    } else {
        // 休息结束，回到专注
        switchMode('pomodoro');
    }

    // 自动开始
    if (getSettings().autoStart) {
        startTimer();
    }
}

// ---- 模式切换 ----
function switchMode(mode) {
    clearInterval(STATE.timer);
    STATE.timer = null;
    STATE.isRunning = false;
    STATE.mode = mode;
    STATE.totalTime = getModeDuration(mode);
    STATE.timeLeft = STATE.totalTime;

    // UI 模式切换
    DOM.modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    document.documentElement.dataset.mode = mode;

    DOM.startBtn.style.display = 'inline-block';
    DOM.pauseBtn.style.display = 'none';
    DOM.sep.classList.remove('hidden');
    updateDisplay();
    updateStatus();
}

// ---- 番茄计数 ----
function updatePomodoroCount() {
    DOM.completedCount.textContent = STATE.completedPomodoros;

    // 更新圆点
    const settings = getSettings();
    const interval = settings.longInterval || 4;
    DOM.countDots.innerHTML = '';
    for (let i = 0; i < interval; i++) {
        const dot = document.createElement('span');
        dot.className = 'count-dot' + (i < STATE.currentStreak ? ' completed' : '');
        DOM.countDots.appendChild(dot);
    }
}

// ---- 统计 ----
function saveDailyStats() {
    const stats = getStats();
    const today = getTodayKey();
    const week = getWeekKey(new Date());

    // 日统计
    stats.daily[today] = (stats.daily[today] || 0) + 1;
    stats.total = (stats.total || 0) + 1;

    // 周统计
    if (!stats.weekly[week]) stats.weekly[week] = {};
    stats.weekly[week][today] = (stats.weekly[week][today] || 0) + 1;

    saveStatsToStorage(stats);
}

function updateStatsDisplay() {
    const stats = getStats();
    const today = getTodayKey();
    const week = getWeekKey(new Date());

    DOM.statToday.textContent = stats.daily[today] || 0;

    // 本周总计
    const weekData = stats.weekly[week] || {};
    let weekTotal = 0;
    Object.values(weekData).forEach(v => weekTotal += v);
    DOM.statWeek.textContent = weekTotal;

    DOM.statTotal.textContent = stats.total || 0;

    // 专注时长（25分钟一个番茄）
    const focusMinutes = (stats.total || 0) * getSettings().pomodoro;
    const hours = Math.floor(focusMinutes / 60);
    const mins = focusMinutes % 60;
    DOM.statFocusTime.textContent = hours > 0 ? `${hours}h${mins > 0 ? mins : ''}` : `${mins}分钟`;

    // 周图表
    renderWeekChart(weekData);
}

function renderWeekChart(weekData) {
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const weekStart = new Date(getWeekKey(new Date()));
    const maxVal = Math.max(...Object.values(weekData), 1);

    DOM.statChart.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const val = weekData[key] || 0;
        const height = Math.max(4, (val / maxVal) * 80);

        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = height + 'px';
        bar.style.backgroundColor = val > 0 ? 'var(--accent)' : 'var(--border)';

        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = days[i];

        const value = document.createElement('span');
        value.className = 'chart-value';
        value.textContent = val || '';
        value.style.display = val > 0 ? 'block' : 'none';

        bar.appendChild(value);
        bar.appendChild(label);
        DOM.statChart.appendChild(bar);
    }
}

// ---- 任务管理 ----
function loadTasks() {
    const tasks = getTasks();
    DOM.taskList.innerHTML = '';
    const done = tasks.filter(t => t.done).length;
    DOM.taskProgress.textContent = `${done}/${tasks.length}`;

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.dataset.index = index;

        const checkbox = document.createElement('span');
        checkbox.className = 'task-checkbox' + (task.done ? ' done' : '');
        checkbox.addEventListener('click', () => toggleTask(index));

        const text = document.createElement('span');
        text.className = 'task-text' + (task.done ? ' done' : '');
        text.textContent = task.text;

        const del = document.createElement('button');
        del.className = 'task-delete';
        del.textContent = '✕';
        del.addEventListener('click', () => deleteTask(index));

        li.appendChild(checkbox);
        li.appendChild(text);
        li.appendChild(del);
        DOM.taskList.appendChild(li);
    });
}

function addTask(text) {
    if (!text.trim()) return;
    const tasks = getTasks();
    tasks.push({ text: text.trim(), done: false, createdAt: Date.now() });
    saveTasksToStorage(tasks);
    loadTasks();
}

function toggleTask(index) {
    const tasks = getTasks();
    if (tasks[index]) {
        tasks[index].done = !tasks[index].done;
        saveTasksToStorage(tasks);
        loadTasks();
    }
}

function deleteTask(index) {
    const tasks = getTasks();
    tasks.splice(index, 1);
    saveTasksToStorage(tasks);
    loadTasks();
}

// ---- 主题 ----
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.dataset.theme === 'dark';
    html.dataset.theme = isDark ? 'light' : 'dark';
    DOM.themeToggle.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('pomodoro_theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
    const saved = localStorage.getItem('pomodoro_theme');
    if (saved === 'dark' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.dataset.theme = 'dark';
        DOM.themeToggle.textContent = '☀️';
    } else {
        document.documentElement.dataset.theme = 'light';
        DOM.themeToggle.textContent = '🌙';
    }
}

// ---- 弹窗 ----
function openModal(modal) {
    modal.classList.add('open');
}

function closeModal(modal) {
    modal.classList.remove('open');
}

// ---- 设置 ----
function loadSettingsToUI() {
    const settings = getSettings();
    DOM.settingPomodoro.value = settings.pomodoro;
    DOM.settingShortBreak.value = settings.shortBreak;
    DOM.settingLongBreak.value = settings.longBreak;
    DOM.settingLongInterval.value = settings.longInterval;
    DOM.settingNotification.checked = settings.notification;
    DOM.settingSound.checked = settings.sound;
    DOM.settingAutoStart.checked = settings.autoStart;
}

function applySettings() {
    const settings = getSettings();
    // 如果当前模式的时间变了，需要刷新
    const newDuration = getModeDuration(STATE.mode);
    if (newDuration !== STATE.totalTime && !STATE.isRunning) {
        STATE.totalTime = newDuration;
        STATE.timeLeft = Math.min(STATE.timeLeft, STATE.totalTime);
        updateDisplay();
    }
    updatePomodoroCount();
}

// ---- 初始化 ----
function init() {
    loadTheme();
    loadSettingsToUI();

    // 加载今日番茄数
    const stats = getStats();
    const today = getTodayKey();
    STATE.completedPomodoros = stats.daily[today] || 0;
    STATE.currentStreak = STATE.completedPomodoros % (getSettings().longInterval || 4);
    updatePomodoroCount();

    // 初始化计时
    STATE.mode = 'pomodoro';
    STATE.totalTime = getModeDuration('pomodoro');
    STATE.timeLeft = STATE.totalTime;
    document.documentElement.dataset.mode = 'pomodoro';
    updateDisplay();
    updateStatus();

    // 加载任务
    loadTasks();

    // ---- 事件绑定 ----

    // 模式切换
    DOM.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (STATE.isRunning) return; // 运行时不允许切换
            switchMode(btn.dataset.mode);
        });
    });

    // 计时控制
    DOM.startBtn.addEventListener('click', startTimer);
    DOM.pauseBtn.addEventListener('click', pauseTimer);
    DOM.resetBtn.addEventListener('click', resetTimer);
    DOM.skipBtn.addEventListener('click', () => {
        if (STATE.isRunning) pauseTimer();
        onTimerComplete();
    });

    // 任务
    DOM.addTaskBtn.addEventListener('click', () => {
        addTask(DOM.taskInput.value);
        DOM.taskInput.value = '';
    });
    DOM.taskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            addTask(DOM.taskInput.value);
            DOM.taskInput.value = '';
        }
    });

    // 弹窗
    DOM.statsToggle.addEventListener('click', () => {
        updateStatsDisplay();
        openModal(DOM.statsModal);
    });
    DOM.statsClose.addEventListener('click', () => closeModal(DOM.statsModal));
    DOM.statsModal.addEventListener('click', e => {
        if (e.target === DOM.statsModal) closeModal(DOM.statsModal);
    });

    DOM.settingsToggle.addEventListener('click', () => openModal(DOM.settingsModal));
    DOM.settingsClose.addEventListener('click', () => closeModal(DOM.settingsModal));
    DOM.settingsModal.addEventListener('click', e => {
        if (e.target === DOM.settingsModal) closeModal(DOM.settingsModal);
    });

    DOM.saveSettings.addEventListener('click', () => {
        const settings = {
            pomodoro: parseInt(DOM.settingPomodoro.value) || 25,
            shortBreak: parseInt(DOM.settingShortBreak.value) || 5,
            longBreak: parseInt(DOM.settingLongBreak.value) || 15,
            longInterval: parseInt(DOM.settingLongInterval.value) || 4,
            notification: DOM.settingNotification.checked,
            sound: DOM.settingSound.checked,
            autoStart: DOM.settingAutoStart.checked,
        };
        saveSettingsToStorage(settings);
        applySettings();
        closeModal(DOM.settingsModal);
    });

    // 统计重置
    DOM.resetStatsBtn.addEventListener('click', () => {
        if (confirm('确定要重置所有统计数据吗？（不可恢复）')) {
            const stats = getStats();
            stats.daily = {};
            stats.weekly = {};
            stats.total = 0;
            saveStatsToStorage(stats);
            STATE.completedPomodoros = 0;
            STATE.currentStreak = 0;
            updatePomodoroCount();
            updateStatsDisplay();
        }
    });

    // 主题
    DOM.themeToggle.addEventListener('click', toggleTheme);

    // ESC 关闭弹窗
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal(DOM.statsModal);
            closeModal(DOM.settingsModal);
        }
    });
}

// 页面加载完成后启动
document.addEventListener('DOMContentLoaded', init);
