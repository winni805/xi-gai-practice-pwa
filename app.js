(() => {
  'use strict';

  const D = window.XIGAI_DATA;
  const app = document.querySelector('#app');
  const toastBox = document.querySelector('#toast');
  const KEY = 'xigai_h5_v1';
  const LETTERS = 'ABCD';
  let view = 'home';
  let ui = { studyMode: null, studyCh: 1, wrongFilter: 'all', kmDetail: null };
  let session = null;
  let result = null;
  let quizTimer = null;
  let matchGame = null;
  let timelineGame = null;
  let cannon = { game: null, canvas: null, ctx: null, frame: 0, settings: { mode: 'pass', speed: .28 } };

  const defaults = () => ({
    score: 0, level: 1, streak: 0, maxStreak: 0, signedDays: [], lastSignDate: '', signStreak: 0, maxSignStreak: 0,
    achievements: {}, kmUnlocked: {}, chProgress: {}, essayMemorized: [], wrong: [], realDone: 0, totalQ: 0, correctQ: 0
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = raw => {
    const state = Object.assign(defaults(), raw || {});
    ['signedDays', 'essayMemorized', 'wrong'].forEach(key => { if (!Array.isArray(state[key])) state[key] = []; });
    ['achievements', 'kmUnlocked', 'chProgress'].forEach(key => { if (!state[key] || Array.isArray(state[key])) state[key] = {}; });
    return state;
  };
  const state = () => {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (_) { return defaults(); }
  };
  const save = value => { localStorage.setItem(KEY, JSON.stringify(normalize(value))); return normalize(value); };
  const update = fn => { const next = state(); fn(next); recalcLevel(next); return save(next); };
  const recalcLevel = s => { s.level = D.LEVELS.reduce((found, item, index) => s.score >= item.min ? index + 1 : found, 1); };
  const today = () => new Date().toISOString().slice(0, 10);
  const shuffle = list => { const result = list.slice(); for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; };
  const sample = (list, count) => shuffle(list).slice(0, Math.min(count, list.length));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  const nl = value => esc(value).replace(/\n/g, '<br>');
  const toast = text => { toastBox.textContent = text; toastBox.classList.add('show'); clearTimeout(toastBox._timer); toastBox._timer = setTimeout(() => toastBox.classList.remove('show'), 2100); };
  const setView = (next, options = {}) => {
    clearInterval(quizTimer); quizTimer = null;
    if (view === 'cannon' && next !== 'cannon') stopCannon();
    view = next;
    if (options.push !== false) history.pushState({ view: next }, '', location.pathname + location.search);
    render(); window.scrollTo({ top: 0, behavior: 'instant' });
  };
  window.addEventListener('popstate', event => { view = event.state?.view || 'home'; render(); });

  function grant(s, id, earned) {
    const definition = D.ACHIEVEMENTS[id];
    if (!definition || s.achievements[id]) return;
    s.achievements[id] = true; s.score += definition.reward; earned.push({ id, ...definition });
  }
  function applyAchievements(s, context = {}) {
    const earned = [];
    const allThree = D.CHAPTERS.every(chapter => (s.chProgress[chapter.id]?.stars || 0) >= 3);
    if (s.correctQ >= 1) grant(s, 'firstQ', earned);
    if (s.maxStreak >= 10) grant(s, 'streak10', earned);
    if (s.maxStreak >= 20) grant(s, 'streak20', earned);
    if ((s.chProgress[1]?.best || 0) >= 80) grant(s, 'ch1clear', earned);
    if (allThree) grant(s, 'allCh', earned);
    if (s.realDone >= 20) grant(s, 'real20', earned);
    if (context.mode === 'real' && context.score >= 90) grant(s, 'real90', earned);
    if (context.game === 'cannon' && context.score >= 60) grant(s, 'cannon', earned);
    if (context.game === 'cannon' && context.score >= 90) grant(s, 'shooter', earned);
    if (s.maxSignStreak >= 7) grant(s, 'sign7', earned);
    if (s.essayMemorized.length >= 10) grant(s, 'essay10', earned);
    if (s.essayMemorized.length >= D.ESSAYS.length) grant(s, 'essayAll', earned);
    if (Object.keys(s.kmUnlocked).length >= 5) grant(s, 'km5', earned);
    if (Object.keys(s.kmUnlocked).length >= D.KM_CARDS.length) grant(s, 'kmAll', earned);
    if (context.game === 'match' && context.complete) grant(s, 'match', earned);
    if (context.game === 'timeline' && context.complete) grant(s, 'timeline', earned);
    if (context.score >= 60 && context.mode !== 'chapter') grant(s, 'pass60', earned);
    recalcLevel(s); return earned;
  }
  const top = (title, right = '') => `<header class="topbar"><button class="back" data-action="home" aria-label="返回首页">‹</button><h2>${esc(title)}</h2>${right}</header>`;
  const installBanner = () => `<div class="install-banner"><span>📲 可添加到手机桌面，之后可离线练习。</span><button data-action="install">添加</button></div>`;
  const stars = progress => '★'.repeat(progress?.stars || 0) + '☆'.repeat(3 - (progress?.stars || 0));
  const formatTime = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

  function homeView() {
    const s = state(); const levelName = D.LEVELS[s.level - 1]?.name || '学习者'; const totalItems = D.BANK.length + D.ESSAYS.length;
    const exam = new Date('2026-10-25T00:00:00+08:00');
    const days = Math.max(0, Math.ceil((exam - Date.now()) / 86400000));
    const signed = s.lastSignDate === today();
    const earned = Object.keys(s.achievements).length;
    return `<main class="shell"><section class="hero"><div class="eyebrow">15040 · 自考刷题工具</div><h1>🎯 习概自考大冒险</h1><p class="hero-sub">习近平新时代中国特色社会主义思想概论</p><div class="stat-row"><div class="stat"><b>${s.level}·${esc(levelName)}</b><span>等级</span></div><div class="stat"><b>${s.score}</b><span>积分</span></div><div class="stat"><b>${s.streak}</b><span>连击</span></div><button class="stat" data-action="sign"><b>${signed ? '✓' : '签'}</b><span>${signed ? '已签到' : '每日签到'}</span></button></div><div class="countdown">📅 距 2026 年 10 月考试还有 ${days} 天</div></section>
      <section class="section"><div class="section-heading"><span>🎮 趣味游戏</span><small>边玩边记</small></div><div class="grid"><button class="menu featured" data-action="go" data-view="cannon"><i class="menu-icon">🎯</i><b class="menu-title">守城射击</b><span class="menu-desc">滑动炮台，射中正确选项</span><em class="badge gold">HOT</em></button><button class="menu" data-action="go" data-view="match"><i class="menu-icon">🔗</i><b class="menu-title">连连看</b><span class="menu-desc">考点配对记忆</span></button><button class="menu" data-action="go" data-view="timeline"><i class="menu-icon">📅</i><b class="menu-title">时间轴</b><span class="menu-desc">历史事件排序</span></button></div></section>
      <section class="section"><div class="section-heading"><span>📝 刷题模式</span><small>${totalItems} 题离线题库</small></div><div class="grid"><button class="menu" data-action="go" data-view="chapters"><i class="menu-icon">🏰</i><b class="menu-title">章节闯关</b><span class="menu-desc">18 章 · ${D.BANK.length} 道单选</span></button><button class="menu" data-action="go" data-view="practice"><i class="menu-icon">🎲</i><b class="menu-title">随机练习</b><span class="menu-desc">专项、冲刺与模拟卷</span></button><button class="menu wide" data-action="go" data-view="real"><i class="menu-icon">📜</i><span><b class="menu-title">历年真题</b><span class="menu-desc">客观题答题卡与简答参考</span></span><em class="badge">真题</em></button><button class="menu" data-action="go" data-view="wrong"><i class="menu-icon">📕</i><b class="menu-title">错题本</b><span class="menu-desc">${s.wrong.length} 道待巩固错题</span></button></div></section>
      <section class="section"><div class="section-heading"><span>📖 学习模式</span><small>按自己的节奏</small></div><div class="grid"><button class="menu" data-action="go" data-view="study"><i class="menu-icon">🧠</i><b class="menu-title">背题模式</b><span class="menu-desc">单选、解析与简答</span></button><button class="menu" data-action="go" data-view="knowledge"><i class="menu-icon">🗺️</i><b class="menu-title">知识地图</b><span class="menu-desc">核心知识卡牌</span></button><button class="menu" data-action="go" data-view="achievements"><i class="menu-icon">🏆</i><b class="menu-title">我的成就</b><span class="menu-desc">已解锁 ${earned} / ${Object.keys(D.ACHIEVEMENTS).length}</span></button></div></section>${installBanner()}<button class="secondary" style="margin-top:14px" data-action="reset">🔄 重置这台手机的学习存档</button></main>`;
  }

  function chaptersView() {
    const s = state();
    const cards = D.CHAPTERS.map(ch => { const p = s.chProgress[ch.id] || {}; const count = D.BANK.filter(q => q.ch === ch.id).length; return `<button class="list-card" data-action="startChapter" data-ch="${ch.id}"><h3><span class="chapter-mark" style="background:${esc(ch.color)}">${ch.id}</span>${esc(ch.name)} <span class="stars">${stars(p)}</span></h3><p class="meta">${count} 道单选 · 最佳正确率 ${p.best || 0}% · 每次随机抽 15 题</p></button>`; }).join('');
    return `<main class="shell">${top('🏰 章节闯关')}<p class="intro">从各章题库随机抽取 15 题。正确率 50% / 70% / 90% 分别获得一至三星。</p><div class="list">${cards}</div></main>`;
  }

  function practiceView() {
    const singleCount = D.BANK.length;
    const block = (title, text, action, type) => `<article class="mode-card"><h3>${title}</h3><p>${text}</p><button class="primary" data-action="${action}" data-type="${type}">开始练习</button></article>`;
    return `<main class="shell">${top('🎲 随机练习与模拟卷')}<p class="intro">所有题目均来自当前离线题库；答题、错题和积分只保存在本机浏览器。</p>${block('全题库随机 20 题',`从 ${singleCount} 道单选中随机抽题，适合每天热身。`,'startPractice','20')}${block('单选专项 30 题','集中练习本课程单选题，限时 20 分钟。','startPractice','30')}${block('单选冲刺 50 题','考前连续训练，限时约 34 分钟。','startPractice','50')}<section class="section"><div class="section-heading"><span>🧾 模拟卷</span><small>答题卡模式</small></div>${block('快速小测 · 20 题','限时 20 分钟，可跳题并在答题卡中回看。','startMock','20')}${block('标准模拟卷 · 50 题','限时 50 分钟，交卷后统一评分。','startMock','50')}${block('考前全真卷 · 100 题','限时 100 分钟，模拟完整客观题训练。','startMock','100')}</section></main>`;
  }

  function startQuiz(config) {
    session = Object.assign({ idx:0, answers:[], checked:[], startedAt:Date.now(), showCard:false }, config);
    session.questions = config.questions.map(clone); session.answers = new Array(session.questions.length).fill(null); session.checked = new Array(session.questions.length).fill(false);
    setView('quiz');
  }
  function questionCorrect(q, answer) { return Number(answer) === Number(q.ans); }
  function quizView() {
    if (!session?.questions?.length) { setView('home', { push:false }); return ''; }
    const q = session.questions[session.idx]; const selected = session.answers[session.idx]; const checked = session.checked[session.idx];
    const duration = session.duration || 0; const left = duration ? Math.max(0, duration - Math.floor((Date.now() - session.startedAt) / 1000)) : 0;
    const options = q.opts.map((option, index) => { let cls=''; if (checked) { if (index === q.ans) cls='correct'; else if (index === selected) cls='wrong'; } return `<button class="option ${cls}" data-action="answer" data-index="${index}" ${checked ? 'disabled' : ''}><b>${LETTERS[index]}</b><span>${esc(option)}</span></button>`; }).join('');
    const card = session.showCard ? `<div class="answer-grid">${session.answers.map((answer,index) => `<button class="${index === session.idx ? 'current ':''}${answer !== null ? 'done':''}" data-action="jump" data-index="${index}">${index + 1}</button>`).join('')}</div>` : '';
    const explain = checked ? `<div class="explain"><b>答案：${LETTERS[q.ans]}．${esc(q.opts[q.ans])}</b>${q.exp ? `<br>${esc(q.exp)}` : ''}</div>` : '';
    const nextText = session.idx === session.questions.length - 1 ? (session.showCard ? '交卷' : '完成本次练习') : '下一题';
    return `<main class="shell">${top(session.title, duration ? `<span id="clock" class="clock">${formatTime(left)}</span>` : '')}<div class="quiz-progress"><i style="width:${(session.idx + 1) / session.questions.length * 100}%"></i></div>${card}<article class="question-card"><div class="q-meta"><span class="q-type">单选</span>第 ${session.idx + 1} / ${session.questions.length} 题${session.showCard ? ' · 可跳题' : ''}</div><p class="question">${esc(q.q)}</p><div class="options">${options}</div>${explain}</article><div class="quiz-actions"><button class="secondary" data-action="previous" ${session.idx === 0 ? 'disabled' : ''}>上一题</button><button class="primary" data-action="next">${nextText}</button></div></main>`;
  }
  function armQuizTimer() {
    if (!session?.duration || view !== 'quiz') return;
    clearInterval(quizTimer);
    quizTimer = setInterval(() => { if (!session || view !== 'quiz') return; const left = Math.max(0, session.duration - Math.floor((Date.now() - session.startedAt) / 1000)); const clock = document.querySelector('#clock'); if (clock) clock.textContent = formatTime(left); if (!left) finishQuiz(true); }, 1000);
  }
  function chooseAnswer(index) {
    if (!session) return; session.answers[session.idx] = index;
    if (!session.showCard) { session.checked[session.idx] = true; const q = session.questions[session.idx]; if (!questionCorrect(q,index)) update(s => { if (!s.wrong.some(item => item.id === q.id || item.q === q.q)) s.wrong.unshift(q); }); }
    render();
  }
  function finishQuiz(timedOut = false) {
    if (!session) return; clearInterval(quizTimer);
    const questions = session.questions; const correct = questions.reduce((total,q,index) => total + (questionCorrect(q,session.answers[index]) ? 1 : 0), 0); const score = questions.length ? Math.round(correct / questions.length * 100) : 0;
    const earned = []; update(s => {
      s.totalQ += questions.length; s.correctQ += correct; s.score += correct * 10; s.streak = correct === questions.length ? s.streak + correct : 0; s.maxStreak = Math.max(s.maxStreak, s.streak);
      questions.forEach((q,index) => { if (!questionCorrect(q,session.answers[index]) && !s.wrong.some(item => item.id === q.id || item.q === q.q)) s.wrong.unshift(q); });
      if (session.mode === 'chapter') { const previous = s.chProgress[session.chId] || { stars:0,best:0 }; const earnedStars = score >= 90 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0; s.chProgress[session.chId] = { stars:Math.max(previous.stars,earnedStars), best:Math.max(previous.best,score) }; if (score >= 90) D.KM_CARDS.filter(card => card.unlockCh === session.chId && !s.kmUnlocked[card.id]).forEach(card => { s.kmUnlocked[card.id] = 'chapter'; s.score += 30; earned.push({ name:`解锁「${card.name}」知识卡`, reward:30 }); }); }
      if (session.mode === 'real') s.realDone += questions.length;
      if (session.mode === 'wrong') { s.wrong = s.wrong.filter(wrong => !questions.some((q,index) => (q.id === wrong.id || q.q === wrong.q) && questionCorrect(q,session.answers[index]))); }
      earned.push(...applyAchievements(s,{ mode:session.mode,score }));
    });
    result = { title:session.title, total:questions.length, correct, score, earned, timedOut, essays:session.essays || [], material:session.material || null };
    session = null; setView('result');
  }
  function resultView() {
    if (!result) { setView('home',{push:false}); return ''; }
    const pass = result.score >= 60; const extras = result.earned.length ? `<div class="tip-list">🏆 ${result.earned.map(item => `${esc(item.name)} +${item.reward} 积分`).join('<br>🏆 ')}</div>` : '';
    const references = result.essays.length || result.material ? `<section class="section essay-list"><div class="section-heading"><span>📝 简答与材料题参考</span></div>${result.essays.map((essay,index) => `<details><summary>${index+1}. ${esc(essay.q)}</summary><div class="answer">${nl(essay.ans)}</div></details>`).join('')}${result.material ? `<details><summary>材料题：${esc(result.material.q)}</summary><div class="answer">${nl(result.material.ans)}</div></details>`:''}</section>`:'';
    return `<main class="shell">${top('答题结果')}<section class="section result"><div class="emoji">${pass ? '🎉' : '📚'}</div><h2>${pass ? '完成得很棒！' : '再巩固一下吧'}</h2><div class="big-score">${result.score}</div><p>${result.correct} / ${result.total} 道正确${result.timedOut ? ' · 已自动交卷' : ''}</p><div class="tip-list">${pass ? '已获得本次正确题积分，继续保持节奏。' : '本次错题已加入错题本，之后可重新练习。'}</div>${extras}<button class="primary" data-action="home">返回首页</button><button class="secondary" style="margin-top:10px" data-action="go" data-view="wrong">查看错题本</button></section>${references}</main>`;
  }

  function realView() {
    const papers = Object.entries(D.REAL_EXAMS).sort((a,b) => b[0].localeCompare(a[0]));
    return `<main class="shell">${top('📜 历年真题')}<p class="intro">客观题支持答题卡与限时；交卷后可查看简答和材料题参考答案。</p><div class="list">${papers.map(([year,paper]) => `<button class="list-card" data-action="startReal" data-year="${year}"><h3>${esc(year)} · ${esc(paper.name)}</h3><p class="meta">${paper.singles.length} 道单选 + ${paper.essays.length} 道简答 + 1 道材料题 · 150 分钟</p></button>`).join('')}</div><button class="primary" style="margin-top:14px" data-action="randomReal">🎲 随机真题 20 题</button><section class="section essay-list"><div class="section-heading"><span>📝 历年简答 / 材料题</span></div>${papers.map(([year,paper]) => `<details><summary>${esc(year)} · 展开参考答案</summary>${paper.essays.map((essay,index)=>`<div class="answer"><b>${index+1}. ${esc(essay.q)}</b><br>${nl(essay.ans)}</div>`).join('')}<div class="answer"><b>材料题：${esc(paper.material.q)}</b><br>${nl(paper.material.ans)}</div></details>`).join('')}</section></main>`;
  }

  function wrongView() {
    const s = state(); const filters = [['all','全部'],['single','单选']]; const list = s.wrong.filter(q => ui.wrongFilter === 'all' || q.type === ui.wrongFilter);
    return `<main class="shell">${top('📕 错题本')}<div class="filter-row">${filters.map(([id,name])=>`<button class="filter ${ui.wrongFilter===id?'active':''}" data-action="wrongFilter" data-filter="${id}">${name}</button>`).join('')}</div>${list.length ? `<div class="list">${list.map((q,index) => `<article class="list-card"><h3>${index+1}. ${esc(q.q)}</h3><p class="meta">正确答案：${LETTERS[q.ans]}．${esc(q.opts[q.ans])}</p>${q.exp ? `<div class="answer">${esc(q.exp)}</div>`:''}<button class="reveal" data-action="removeWrong" data-id="${esc(q.id || '')}" data-q="${encodeURIComponent(q.q)}">从错题本移除</button></article>`).join('')}</div><div class="button-row"><button class="primary" data-action="redoWrong">重新练习本页错题</button><button class="secondary" data-action="clearWrong">清空错题本</button></div>` : `<div class="empty">🎉 暂无错题。<br>继续练习，稳步进步！</div>`}</main>`;
  }

  function studyView() {
    const choices = `<div class="button-row"><button class="${ui.studyMode==='single'?'primary':'secondary'}" data-action="studyMode" data-mode="single">单选背题</button><button class="${ui.studyMode==='essay'?'primary':'secondary'}" data-action="studyMode" data-mode="essay">简答背诵</button></div>`;
    if (!ui.studyMode) return `<main class="shell">${top('🧠 背题模式')}<p class="intro">先自己思考，再点击题目展开答案与解析；简答题可标记为“已背”。</p>${choices}<section class="section"><h3>共 ${D.BANK.length} 道单选题 · ${D.ESSAYS.length} 道简答题</h3><p class="intro" style="margin-top:8px">题库和学习记录都在当前手机浏览器本地保存。</p></section></main>`;
    if (ui.studyMode === 'single') { const list = D.BANK.filter(q => q.ch === Number(ui.studyCh)); return `<main class="shell">${top('🧠 单选背题')}${choices}<label class="intro">选择章节 <select id="studyCh">${D.CHAPTERS.map(ch=>`<option value="${ch.id}" ${Number(ui.studyCh)===ch.id?'selected':''}>${esc(ch.name)}</option>`).join('')}</select></label><div class="essay-list">${list.map((q,index)=>`<details><summary>${index+1}. ${esc(q.q)}</summary><div class="answer"><b>答案：${LETTERS[q.ans]}．${esc(q.opts[q.ans])}</b>${q.exp?`<br>${esc(q.exp)}`:''}</div></details>`).join('')}</div></main>`; }
    const s = state(); return `<main class="shell">${top('🧠 简答题背诵')}${choices}<div class="essay-list">${D.ESSAYS.map((essay,index) => { const done=s.essayMemorized.includes(essay.id); return `<details><summary>${index+1}. ${esc(essay.q)}</summary><div class="answer">${nl(essay.ans)}</div><div class="essay-actions"><span class="meta">${done?'已标记掌握':'尚未标记'}</span><button class="mark ${done?'done':''}" data-action="memorize" data-id="${essay.id}">${done?'✓ 已背':'标记已背'}</button></div></details>`; }).join('')}</div></main>`;
  }

  function knowledgeView() {
    const s = state(); const detail = ui.kmDetail && D.KM_CARDS.find(card => card.id === ui.kmDetail);
    if (detail) return `<main class="shell">${top('🗺️ 知识卡')}<section class="section km-detail"><h3>${detail.icon} ${esc(detail.name)}</h3>${detail.blocks.map(block => `<div class="km-block ${esc(block.type)}"><h4>${esc(block.title)}</h4><div>${block.content}</div></div>`).join('')}<button class="secondary" style="margin-top:14px" data-action="closeKM">返回知识地图</button></section></main>`;
    return `<main class="shell">${top('🗺️ 知识地图', `<span class="clock">${s.score} 积分</span>`)}<p class="intro">章节高分可自动解锁知识卡；也可使用 20 积分解锁。已解锁 ${Object.keys(s.kmUnlocked).length} / ${D.KM_CARDS.length} 张。</p><div class="km-grid">${D.KM_CARDS.map(card => { const unlocked=Boolean(s.kmUnlocked[card.id]); return `<button class="km ${unlocked?'':'locked'}" data-action="openKM" data-id="${card.id}"><i>${card.icon}</i><b>${esc(card.name)}</b><small>${unlocked?'点击查看':'🔒 解锁需要 20 积分'}</small></button>`; }).join('')}</div></main>`;
  }

  function achievementView() {
    const s=state(); const items=Object.entries(D.ACHIEVEMENTS); return `<main class="shell">${top('🏆 我的成就')}<p class="intro">已解锁 <b>${Object.keys(s.achievements).length}</b> / ${items.length} 项成就。</p><div class="list">${items.map(([id,item])=>{ const unlocked=Boolean(s.achievements[id]); return `<article class="list-card" style="${unlocked?'border-color:#f1cf7a;background:#fffbec':''}"><h3>${unlocked?'🏆':'🔒'} ${esc(item.name)} <span class="stars">+${item.reward}</span></h3><p class="meta">${esc(item.desc)}</p></article>`; }).join('')}</div></main>`;
  }

  function matchView() {
    if (!matchGame) initMatch(); const item = entry => `<button class="match-item ${entry.matched?'matched':''} ${entry.selected?'selected':''}" data-action="matchPick" data-side="${entry.side}" data-index="${entry.index}">${esc(entry.n)}</button>`;
    return `<main class="shell">${top('🔗 连连看')}<section class="game-card"><h3>把左右两列的对应概念配对</h3><p class="game-score">已配对 ${matchGame.matched} / ${matchGame.left.length} · 本局 ${matchGame.score} 分</p><div class="match-area"><div class="match-col">${matchGame.left.map((x,index)=>item({...x,index,side:'left',selected:matchGame.selectedL===index})).join('')}</div><div class="match-col">${matchGame.right.map((x,index)=>item({...x,index,side:'right',selected:matchGame.selectedR===index})).join('')}</div></div><button class="secondary" style="margin-top:14px" data-action="restartMatch">换一组题</button></section></main>`;
  }
  function initMatch() { const set=D.MATCH_DATA[Math.floor(Math.random()*D.MATCH_DATA.length)]; matchGame={left:shuffle(clone(set[0])),right:shuffle(clone(set[1])),selectedL:null,selectedR:null,matched:0,score:0}; }
  function pickMatch(side,index) { const key=side==='left'?'selectedL':'selectedR'; if (matchGame[side][index].matched) return; matchGame[key]=matchGame[key]===index?null:index; if (matchGame.selectedL===null||matchGame.selectedR===null) return render(); const left=matchGame.left[matchGame.selectedL],right=matchGame.right[matchGame.selectedR]; if(left.c===right.c){ left.matched=right.matched=true;matchGame.matched++;matchGame.score+=20;const done=matchGame.matched===matchGame.left.length; let earned=[];update(s=>{s.score+=20+(done?30:0);earned=applyAchievements(s,{game:'match',complete:done});});toast(done?(earned.length?'全部配对成功，解锁成就！':'全部配对成功！+30 积分'):'配对成功 +20'); } else toast('配对错误，再想想'); matchGame.selectedL=matchGame.selectedR=null;render(); }

  function timelineView() { if (!timelineGame) initTimeline(); return `<main class="shell">${top('📅 时间轴')}<section class="game-card"><h3>按从早到晚的顺序点击事件</h3><p class="game-score">已完成 ${timelineGame.selected.length} / ${D.TL_EVENTS.length}</p><div class="timeline">${timelineGame.pool.map((item,index)=>`<button data-action="timelinePick" data-index="${index}"><b>${esc(item.name)}</b><span>${esc(item.desc)}</span></button>`).join('')}</div><div class="tip-list">已排序：${timelineGame.selected.length?timelineGame.selected.map(item=>`${item.year} ${esc(item.name)}`).join(' → '):'尚未开始'}</div><button class="secondary" data-action="restartTimeline">重新开始</button></section></main>`; }
  function initTimeline(){timelineGame={pool:shuffle(clone(D.TL_EVENTS)),selected:[]};}
  function pickTimeline(index){const item=timelineGame.pool[index];const earliest=timelineGame.pool.reduce((small,current)=>current.year<small.year?current:small);if(item.year!==earliest.year){toast(`顺序错误，最早的是：${earliest.name}`);return;}timelineGame.pool.splice(index,1);timelineGame.selected.push(item);const done=!timelineGame.pool.length;let earned=[];update(s=>{s.score+=10+(done?50:0);earned=applyAchievements(s,{game:'timeline',complete:done});});if(done)toast(earned.length?'时间轴全对，解锁成就！':'时间轴全对！+50 积分');render();}

  function cannonView() { const g=cannon.game; const settings=cannon.settings; return `<main class="shell${g?' cannon-shell':''}">${top('🎯 守城射击')}<section class="game-card cannon-card${g?' is-playing':''}">${!g?`<h3>按住底部炮台，左右滑动旋转炮口</h3><p class="intro">松手发射炮弹，命中正确选项加分；未击中可继续瞄准。</p><div class="button-row"><button class="${settings.mode==='pass'?'primary':'secondary'}" data-action="cannonMode" data-mode="pass">🏰 2 分钟闯关</button><button class="${settings.mode==='endless'?'primary':'secondary'}" data-action="cannonMode" data-mode="endless">♾️ 无限练习</button></div><div class="filter-row" style="margin-top:13px"><button class="filter ${settings.speed===.16?'active':''}" data-action="cannonSpeed" data-speed=".16">🐢 慢</button><button class="filter ${settings.speed===.28?'active':''}" data-action="cannonSpeed" data-speed=".28">😊 中</button><button class="filter ${settings.speed===.42?'active':''}" data-action="cannonSpeed" data-speed=".42">🚀 快</button></div><button class="primary" data-action="startCannon">开始游戏</button>`:`<div class="cannon-hud"><span>得分 <b id="cScore">${g.score}</b></span><span>❤️ <b id="cLives">${g.lives}</b></span><span>第 <b id="cQ">${g.index+1}</b> 题</span><span><b id="cClock">${settings.mode==='pass'?'02:00':'∞'}</b></span></div>`}<div class="cannon-wrap"><canvas class="cannon-canvas" id="cannonCanvas" aria-label="守城射击游戏"></canvas></div><p class="cannon-help" id="cMessage">${g?'命中正确答案可换题；未击中可重新瞄准。':'选择模式后开始游戏'}</p></section></main>`; }
  function setupCannon() { const canvas=document.querySelector('#cannonCanvas'); if(!canvas) return; cannon.canvas=canvas; const rect=canvas.getBoundingClientRect(); const wrapHeight=canvas.parentElement?.getBoundingClientRect().height||0; const isPlaying=Boolean(cannon.game); const height=isPlaying&&wrapHeight>320?Math.floor(wrapHeight):Math.max(460,rect.width*1.12); const ratio=Math.min(window.devicePixelRatio||1,2); canvas.width=Math.floor(rect.width*ratio); canvas.height=Math.floor(height*ratio); canvas.style.height=`${height}px`; cannon.w=rect.width;cannon.h=height;cannon.ctx=canvas.getContext('2d');cannon.ctx.scale(ratio,ratio);canvas.addEventListener('pointerdown',cannonPointerDown);canvas.addEventListener('pointermove',cannonPointerMove);canvas.addEventListener('pointerup',cannonPointerUp);canvas.addEventListener('pointercancel',cannonPointerCancel);drawCannonIntro();if(cannon.game)runCannon(); }
  function stopCannon(){ if(cannon.frame)cancelAnimationFrame(cannon.frame);cannon.frame=0;cannon.game=null;cannon.canvas=null;cannon.ctx=null; }
  const roundRect=(ctx,x,y,w,h,r)=>{const rad=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rad,y);ctx.lineTo(x+w-rad,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rad);ctx.lineTo(x+w,y+h-rad);ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);ctx.lineTo(x+rad,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rad);ctx.lineTo(x,y+rad);ctx.quadraticCurveTo(x,y,x+rad,y);ctx.closePath();};
  const wrapCanvas=(ctx,text,width)=>{let line='';const lines=[];for(const char of text){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;};
  function drawCannonIntro(){const ctx=cannon.ctx;if(!ctx)return;ctx.fillStyle='#1a0a2e';ctx.fillRect(0,0,cannon.w,cannon.h);ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText('🎯 守城射击',cannon.w/2,cannon.h/2-16);ctx.fillStyle='#d8c8e7';ctx.font='14px sans-serif';ctx.fillText('选择模式后点击开始游戏',cannon.w/2,cannon.h/2+16);}
  function startCannon(){if(!cannon.ctx)return;const questions=shuffle(D.BANK);cannon.game={questions,index:0,current:questions[0],y:24,lives:5,score:0,combo:0,maxCombo:0,angle:0,aiming:false,bullet:null,rects:[],last:performance.now(),start:Date.now(),feedback:null,nextAt:0};render();}
  function runCannon(){if(!cannon.game||!cannon.ctx)return;const g=cannon.game;const now=performance.now();const dt=Math.min(40,now-g.last);g.last=now;const elapsed=Math.floor((Date.now()-g.start)/1000);if(cannon.settings.mode==='pass'&&elapsed>=120){finishCannon();return;}if(g.bullet){g.bullet.x+=g.bullet.vx*dt/16;g.bullet.y+=g.bullet.vy*dt/16;const hit=g.rects.find(r=>g.bullet.x>=r.x&&g.bullet.x<=r.x+r.w&&g.bullet.y>=r.y&&g.bullet.y<=r.y+r.h);if(hit){const index=hit.index;g.bullet=null;resolveCannonShot(index,hit.x+hit.w/2,hit.y+hit.h/2);}else if(g.bullet.x<-12||g.bullet.x>cannon.w+12||g.bullet.y<-12){g.bullet=null;cannonMessage('没有击中选项，继续调整炮口！');}}if(g.nextAt&&Date.now()>=g.nextAt){g.nextAt=0;g.index=(g.index+1)%g.questions.length;if(g.index===0)g.questions=shuffle(g.questions);g.current=g.questions[g.index];g.y=24;g.feedback=null;}if(!g.nextAt){g.y+=cannon.settings.speed*dt/16;if(g.y>cannon.h-270){g.lives--;g.combo=0;cannonMessage('题目落地，损失 1 条生命');if(g.lives<=0){finishCannon();return;}g.index=(g.index+1)%g.questions.length;g.current=g.questions[g.index];g.y=24;}}drawCannon();const clock=document.querySelector('#cClock');if(clock)clock.textContent=cannon.settings.mode==='pass'?formatTime(120-elapsed):'∞';const score=document.querySelector('#cScore'),lives=document.querySelector('#cLives'),num=document.querySelector('#cQ');if(score)score.textContent=g.score;if(lives)lives.textContent=g.lives;if(num)num.textContent=g.index+1;cannon.frame=requestAnimationFrame(runCannon);}
  function drawCannon(){const ctx=cannon.ctx,g=cannon.game,W=cannon.w,H=cannon.h;if(!ctx||!g)return;const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#17082c');grad.addColorStop(1,'#4b265a');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(255,255,255,.5)';for(let i=0;i<26;i++)ctx.fillRect((i*79)%W,(i*47)%(H-20),2,2);ctx.textAlign='left';ctx.font='bold 14px sans-serif';const qLines=wrapCanvas(ctx,g.current.q,W-34).slice(0,2);const qh=27+qLines.length*20;roundRect(ctx,14,g.y,W-28,qh,11);ctx.fillStyle='#fff';ctx.fill();ctx.fillStyle='#3a2d3a';qLines.forEach((line,i)=>ctx.fillText(line,24,g.y+23+i*20));const gap=6,x0=10,cw=(W-x0*2-gap*3)/4,startY=g.y+qh+13;ctx.font='10px sans-serif';const optionLines=g.current.opts.map(text=>wrapCanvas(ctx,text,cw-14));const ch=Math.max(108,42+Math.max(...optionLines.map(lines=>lines.length))*14);g.rects=[];g.current.opts.forEach((text,index)=>{const x=x0+index*(cw+gap),feedback=g.feedback?.index===index?g.feedback:null;roundRect(ctx,x,startY,cw,ch,9);ctx.fillStyle=feedback?(feedback.correct?'#e9fff0':'#fff0f0'):'#fff9f1';ctx.fill();ctx.strokeStyle=feedback?(feedback.correct?'#43c375':'#ec5c67'):'#ffc6b7';ctx.lineWidth=feedback?3:1.5;ctx.stroke();ctx.fillStyle=feedback?(feedback.correct?'#24834c':'#b7313e'):'#bf2440';ctx.font='bold 13px sans-serif';ctx.fillText(LETTERS[index],x+9,startY+23);ctx.fillStyle='#463845';ctx.font='10px sans-serif';optionLines[index].slice(0,5).forEach((line,i)=>ctx.fillText(line,x+7,startY+44+i*14));g.rects.push({x,y:startY,w:cw,h:ch,index});});const cx=W/2,cy=H-39;ctx.fillStyle='#c5b7c6';ctx.beginPath();ctx.arc(cx,cy,25,Math.PI,0);ctx.fill();ctx.save();ctx.translate(cx,cy);ctx.rotate(g.angle);ctx.fillStyle='#8e728e';roundRect(ctx,-8,-53,16,43,5);ctx.fill();ctx.restore();if(g.aiming){ctx.save();ctx.setLineDash([7,6]);ctx.strokeStyle='rgba(255,229,97,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx+Math.sin(g.angle)*43,cy-Math.cos(g.angle)*43);ctx.lineTo(cx+Math.sin(g.angle)*700,cy-Math.cos(g.angle)*700);ctx.stroke();ctx.restore();}if(g.bullet){ctx.strokeStyle='#ffe468';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(g.bullet.sx,g.bullet.sy);ctx.lineTo(g.bullet.x,g.bullet.y);ctx.stroke();ctx.fillStyle='#fff8a8';ctx.beginPath();ctx.arc(g.bullet.x,g.bullet.y,7,0,Math.PI*2);ctx.fill();}if(g.feedback){ctx.textAlign='center';ctx.font='bold 18px sans-serif';ctx.fillStyle=g.feedback.correct?'#71ff9e':'#ff9b9b';ctx.fillText(g.feedback.correct?`✓ 命中 +${g.feedback.points}`:'✕ 选错了',g.feedback.x,g.feedback.y-10);}}
  function cannonPoint(event){const r=cannon.canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};} function cannonPointerDown(event){const g=cannon.game;if(!g||g.bullet||g.nextAt)return;const p=cannonPoint(event),cx=cannon.w/2,cy=cannon.h-39;if(Math.hypot(p.x-cx,p.y-cy)>78&&!(p.y>cannon.h-120&&Math.abs(p.x-cx)<70)){cannonMessage('请先按住底部炮台，再左右滑动瞄准');return;}cannon.canvas.setPointerCapture?.(event.pointerId);g.aiming=true;g.sx=p.x;g.angle0=g.angle;cannonMessage('左右滑动旋转炮口，松手发射！');} function cannonPointerMove(event){const g=cannon.game;if(!g?.aiming)return;const p=cannonPoint(event);g.angle=Math.max(-1.12,Math.min(1.12,g.angle0+(p.x-g.sx)/150));} function cannonPointerUp(){const g=cannon.game;if(!g?.aiming)return;g.aiming=false;const cx=cannon.w/2,cy=cannon.h-39,sx=cx+Math.sin(g.angle)*44,sy=cy-Math.cos(g.angle)*44;g.bullet={sx,sy,x:sx,y:sy,vx:Math.sin(g.angle)*10,vy:-Math.cos(g.angle)*10};cannonMessage('炮弹发射！');} function cannonPointerCancel(){if(cannon.game)cannon.game.aiming=false;}
  function resolveCannonShot(index,x,y){const g=cannon.game;const correct=index===g.current.ans;g.feedback={index,x,y,correct,points:0};if(correct){g.combo++;const points=10+Math.min(g.combo-1,5)*5;g.feedback.points=points;g.score+=points;g.nextAt=Date.now()+520;update(s=>{s.score+=points;s.streak++;s.maxStreak=Math.max(s.maxStreak,s.streak);});cannonMessage(`命中正确答案！+${points}`);}else{g.combo=0;update(s=>{s.streak=0;});cannonMessage('选错了，题目仍会继续下落');}}
  function cannonMessage(text){const target=document.querySelector('#cMessage');if(target)target.textContent=text;}
  function finishCannon(){const g=cannon.game;if(!g)return;const passed=g.score>=60;let earned=[];update(s=>{earned=applyAchievements(s,{game:'cannon',score:g.score});});stopCannon();toast(`${passed?'守城成功':'游戏结束'}：${g.score} 分${earned.length?'，解锁新成就！':''}`);render();}

  function render() {
    const views = { home:homeView, chapters:chaptersView, practice:practiceView, quiz:quizView, result:resultView, real:realView, wrong:wrongView, study:studyView, knowledge:knowledgeView, achievements:achievementView, match:matchView, timeline:timelineView, cannon:cannonView };
    app.innerHTML = (views[view] || homeView)();
    if (view === 'quiz') armQuizTimer();
    if (view === 'cannon') requestAnimationFrame(setupCannon);
  }

  function showInstallHelp() { const apple=/iphone|ipad|ipod/i.test(navigator.userAgent); const message=apple?'请在 Safari 浏览器点击“分享”，再选择“添加到主屏幕”。微信内打开时，请先点右上角“…”选择在浏览器打开。':'点击浏览器菜单中的“安装应用”或“添加到主屏幕”，即可像 App 一样从桌面进入。'; const modal=document.createElement('div');modal.className='modal-mask';modal.innerHTML=`<section class="modal"><h3>📲 添加到手机桌面</h3><p>${message}</p><button class="primary">知道了</button></section>`;modal.addEventListener('click',event=>{if(event.target===modal||event.target.matches('button'))modal.remove();});document.body.append(modal); }
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt=event; });
  window.addEventListener('appinstalled', () => { installPrompt=null; toast('已添加到手机桌面'); });

  app.addEventListener('click', event => {
    const target=event.target.closest('[data-action]'); if(!target)return; const action=target.dataset.action;
    if(action==='home') return setView('home');
    if(action==='go') return setView(target.dataset.view);
    if(action==='sign'){const s=state();if(s.lastSignDate===today())return toast('今天已经签到啦');const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);const streak=s.lastSignDate===yesterday?s.signStreak+1:1;const reward=[20,25,30,35,40,45,145][Math.min(streak-1,6)];let earned=[];update(now=>{now.signedDays.push(today());now.lastSignDate=today();now.signStreak=streak;now.maxSignStreak=Math.max(now.maxSignStreak,streak);now.score+=reward;earned=applyAchievements(now,{});});toast(`签到成功 +${reward} 积分${earned.length?'，解锁成就！':''}`);return render();}
    if(action==='reset'){if(confirm('确定重置本机存档吗？积分、错题和背题记录都会清空。')){localStorage.removeItem(KEY);toast('本机存档已重置');render();}return;}
    if(action==='install'){if(installPrompt){installPrompt.prompt();installPrompt.userChoice.finally(()=>installPrompt=null);}else showInstallHelp();return;}
    if(action==='startChapter'){const id=Number(target.dataset.ch);const chapter=D.CHAPTERS.find(ch=>ch.id===id);return startQuiz({title:chapter.name,questions:sample(D.BANK.filter(q=>q.ch===id),15),mode:'chapter',chId:id,duration:15*40});}
    if(action==='startPractice'){const n=Number(target.dataset.type);return startQuiz({title:`随机练习 ${n} 题`,questions:sample(D.BANK,n),mode:'practice',duration:n*40});}
    if(action==='startMock'){const n=Number(target.dataset.type);return startQuiz({title:`${n} 题模拟卷`,questions:sample(D.BANK,n),mode:'mock',duration:n*60,showCard:true});}
    if(action==='answer')return chooseAnswer(Number(target.dataset.index));
    if(action==='jump'){session.idx=Number(target.dataset.index);return render();}
    if(action==='previous'){if(session.idx>0){session.idx--;render();}return;}
    if(action==='next'){if(!session)return;if(session.showCard){if(session.idx===session.questions.length-1){if(confirm('确定交卷吗？未作答题目将按错误计算。'))finishQuiz();}else{session.idx++;render();}}else if(!session.checked[session.idx])toast('请先选择一个答案');else if(session.idx<session.questions.length-1){session.idx++;render();}else finishQuiz();return;}
    if(action==='startReal'){const paper=D.REAL_EXAMS[target.dataset.year];return startQuiz({title:paper.name,questions:paper.singles,mode:'real',duration:150*60,showCard:true,essays:paper.essays,material:paper.material});}
    if(action==='randomReal'){const pool=Object.values(D.REAL_EXAMS).flatMap(p=>p.singles);return startQuiz({title:'随机真题 20 题',questions:sample(pool,20),mode:'practice',duration:20*40});}
    if(action==='wrongFilter'){ui.wrongFilter=target.dataset.filter;return render();}
    if(action==='removeWrong'){const id=target.dataset.id;const q=decodeURIComponent(target.dataset.q||'');update(s=>{s.wrong=s.wrong.filter(item=>(id&&item.id!==id)||(!id&&item.q!==q));});toast('已从错题本移除');return render();}
    if(action==='clearWrong'){if(confirm('确定清空所有错题吗？')){update(s=>{s.wrong=[];});render();}return;}
    if(action==='redoWrong'){const list=state().wrong.filter(q=>ui.wrongFilter==='all'||q.type===ui.wrongFilter);if(!list.length)return toast('当前没有可重练的错题');return startQuiz({title:'错题重练',questions:list,mode:'wrong',duration:list.length*45});}
    if(action==='studyMode'){ui.studyMode=target.dataset.mode;return render();}
    if(action==='memorize'){const id=target.dataset.id;let earned=[];update(s=>{const at=s.essayMemorized.indexOf(id);if(at>=0)s.essayMemorized.splice(at,1);else s.essayMemorized.push(id);earned=applyAchievements(s,{});});if(earned.length)toast('解锁成就！');return render();}
    if(action==='openKM'){const id=Number(target.dataset.id);const s=state();if(s.kmUnlocked[id]){ui.kmDetail=id;return render();}if(s.score<20)return toast('积分不足，需要 20 积分');if(confirm('花费 20 积分解锁此知识卡吗？')){let earned=[];update(now=>{now.score-=20;now.kmUnlocked[id]='score';earned=applyAchievements(now,{});});ui.kmDetail=id;if(earned.length)toast('已解锁知识卡和新成就！');render();}return;}
    if(action==='closeKM'){ui.kmDetail=null;return render();}
    if(action==='matchPick')return pickMatch(target.dataset.side,Number(target.dataset.index));
    if(action==='restartMatch'){initMatch();return render();}
    if(action==='timelinePick')return pickTimeline(Number(target.dataset.index));
    if(action==='restartTimeline'){initTimeline();return render();}
    if(action==='cannonMode'){cannon.settings.mode=target.dataset.mode;return render();}
    if(action==='cannonSpeed'){cannon.settings.speed=Number(target.dataset.speed);return render();}
    if(action==='startCannon')return startCannon();
  });
  app.addEventListener('change', event => { if(event.target.id==='studyCh'){ui.studyCh=Number(event.target.value);render();} });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) window.addEventListener('load', () => {
    let refreshedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshedForUpdate) return;
      refreshedForUpdate = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
  render();
})();
