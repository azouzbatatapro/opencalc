/*
 * OpenCalc — user interface logic.
 * Keypad input, live preview, themes, history panel and all the little
 * animations. Zero dependencies. Pairs with js/parser.js.
 */
(function () {
  'use strict';

  var P = window.OpenCalcParser;

  var STORAGE = {
    theme: 'opencalc.theme',
    history: 'opencalc.history',
    angle: 'opencalc.angle',
    sci: 'opencalc.sci'
  };

  /* ---------- tiny storage helpers (safe in private browsing) ---------- */
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }

  /* ---------- element references ---------- */
  var app = document.getElementById('app');
  var calc = document.querySelector('.calculator');
  var modeSwitch = document.getElementById('mode-switch');
  var exprEl = document.getElementById('expr');
  var resultEl = document.getElementById('result');
  var histPanel = document.getElementById('history');
  var histList = document.getElementById('history-list');
  var histEmpty = document.getElementById('history-empty');
  var histCount = document.getElementById('hist-count');
  var histToggle = document.querySelector('[data-act="history"]');
  var angleBtn = document.getElementById('btn-angle');

  /* ---------- state ---------- */
  var state = {
    expr: '',            // the expression being typed (display symbols: × ÷ − π …)
    justEvaluated: false,
    angleMode: load(STORAGE.angle) === 'rad' ? 'rad' : 'deg',
    sci: load(STORAGE.sci) === '1',
    history: loadHistory()
  };

  function loadHistory() {
    try {
      var raw = JSON.parse(load(STORAGE.history) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (h) {
        return h && typeof h.expr === 'string' &&
               typeof h.result === 'number' && isFinite(h.result);
      }).slice(0, 50);
    } catch (e) { return []; }
  }

  /* ---------- input helpers ---------- */
  var OPERATORS = ['+', '−', '×', '÷', '^'];

  function lastChar() { return state.expr.slice(-1); }
  function isOperator(ch) { return OPERATORS.indexOf(ch) !== -1; }
  /* a character after which the expression currently "holds a value" */
  function endsValue(ch) { return /[0-9)πe!²%]/.test(ch); }
  /* does this button text start a new value? (numbers, "(", constants, functions) */
  function startsValueText(text) {
    return /^[0-9.(]/.test(text) || text === 'π' || text === 'e' ||
           /^(sin|cos|tan|ln|log|√)/.test(text);
  }

  function autoClosed(expr) {
    var opens = (expr.match(/\(/g) || []).length;
    var closes = (expr.match(/\)/g) || []).length;
    return opens > closes ? expr + new Array(opens - closes + 1).join(')') : expr;
  }

  /* ---------- display ---------- */
  function formatResult(v) {
    if (!isFinite(v)) return 'Error';
    if (v === 0) return '0';
    var abs = Math.abs(v);
    if (abs >= 1e15 || abs < 1e-9) {
      return v.toExponential(9)
        .replace(/(\.\d*?)0+e/, '$1e')
        .replace(/\.(?=e)/, '')
        .replace('e+', 'e')
        .replace(/^-/, '−');
    }
    return String(parseFloat(v.toPrecision(12)));
  }

  /* 1234567.8 → "1,234,567.8" (display only — never fed back to the parser) */
  function group(s) {
    if (s.indexOf('e') !== -1) return s;
    var neg = s.charAt(0) === '−' || s.charAt(0) === '-';
    var t = neg ? s.slice(1) : s;
    var parts = t.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + parts.join('.');
  }

  function updateDisplay() {
    exprEl.textContent = state.expr === '' ? '0' : state.expr;
    resultEl.classList.remove('error');
    resultEl.title = '';
    if (state.expr === '') { resultEl.textContent = '0'; return; }
    try {
      var v = P.evaluate(autoClosed(state.expr), { angleMode: state.angleMode });
      resultEl.textContent = group(formatResult(v));
    } catch (e) {
      resultEl.textContent = ''; /* incomplete while typing — no preview yet */
    }
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; /* restart the CSS animation */
    el.classList.add(cls);
  }

  /* ---------- actions ---------- */
  function insert(text) {
    var ins = text;

    if (state.justEvaluated) {
      /* after "=": a value starts a new calculation, an operator continues from the result */
      if (startsValueText(ins)) state.expr = '';
      state.justEvaluated = false;
    }

    var c = lastChar();

    /* auto "×" between a finished value and a new one: 2π, (1+2)3, 2sin(30).
       Digits and dots continue the current number, so they only get an
       implicit "×" after a value ender like ")", "π", "!", "²" or "%". */
    if (c && startsValueText(ins)) {
      var insIsNumberish = /^[0-9.]/.test(ins);
      if (insIsNumberish ? /[)πe!²%]/.test(c) : endsValue(c)) state.expr += '×';
    }
    c = lastChar();

    if (isOperator(ins)) {
      if (state.expr === '' || state.expr === '−') {
        if (ins !== '−' || state.expr === '−') return; /* only a minus may open */
      } else if (isOperator(c)) {
        if (!(ins === '−' && (c === '×' || c === '÷' || c === '^'))) {
          state.expr = state.expr.slice(0, -1); /* replace the operator: 5++ → 5+ */
          var c2 = lastChar();
          if (isOperator(c2) && !(ins === '−' && (c2 === '×' || c2 === '÷' || c2 === '^'))) {
            state.expr = state.expr.slice(0, -1);
          }
        } /* else keep both: 5×−3 */
      }
    } else if (ins === '.') {
      if (/[0-9]e[+−]?$/.test(state.expr)) return;        /* already in an exponent */
      var trailing = (state.expr.match(/[0-9.]*$/) || [''])[0];
      if (trailing.indexOf('.') !== -1) return;            /* one dot per number */
      if (trailing === '') ins = '0.';
    } else if (/^[!²%]$/.test(ins)) {
      if (!c || !endsValue(c)) return;                     /* postfix needs a value */
    }

    if (ins) state.expr += ins;
    updateDisplay();
  }

  function toggleSign() {
    if (state.justEvaluated) {
      state.expr = state.expr.charAt(0) === '−' ? state.expr.slice(1) : '−' + state.expr;
      state.justEvaluated = false;
      updateDisplay();
      return;
    }
    var m = state.expr.match(/((?:\d+\.?\d*|\.\d+)(?:e[+\-−]?\d+)?)$/i);
    if (!m) {
      if (state.expr === '') state.expr = '−';
      updateDisplay();
      return;
    }
    var start = m.index;
    var before = start > 0 ? state.expr.charAt(start - 1) : '';
    var before2 = start > 1 ? state.expr.charAt(start - 2) : '';
    if (before === '−' && (start === 1 || isOperator(before2) || before2 === '(')) {
      state.expr = state.expr.slice(0, start - 1) + state.expr.slice(start); /* remove − */
    } else {
      state.expr = state.expr.slice(0, start) + '−' + state.expr.slice(start);
    }
    updateDisplay();
  }

  function smartParen() {
    var opens = (state.expr.match(/\(/g) || []).length;
    var closes = (state.expr.match(/\)/g) || []).length;
    if (opens > closes && endsValue(lastChar())) insert(')');
    else insert('(');
  }

  function backspace() {
    if (state.expr === '') return;
    state.justEvaluated = false;
    var tail4 = state.expr.slice(-4);
    var cut = (tail4 === 'sin(' || tail4 === 'cos(' || tail4 === 'tan(' ||
               tail4 === 'log(' || tail4 === '√(') ? 4 :
              (state.expr.slice(-3) === 'ln(' ? 3 : 1);
    state.expr = state.expr.slice(0, state.expr.length - cut);
    updateDisplay();
    retrigger(exprEl, 'tick');
  }

  function clearAll() {
    state.expr = '';
    state.justEvaluated = false;
    updateDisplay();
    retrigger(exprEl, 'tick');
  }

  function equals() {
    if (state.expr === '') return;
    var exprToEval = autoClosed(state.expr);
    try {
      var value = P.evaluate(exprToEval, { angleMode: state.angleMode });
      exprEl.textContent = exprToEval;              /* keep showing what produced it */
      resultEl.textContent = group(formatResult(value));
      resultEl.classList.remove('error');
      resultEl.title = '';
      retrigger(resultEl, 'pop');
      state.justEvaluated = true;
      state.expr = String(value);                   /* operators continue from here */
      addHistory(exprToEval, value);
    } catch (err) {
      resultEl.textContent = 'Error';
      resultEl.title = err.message;
      resultEl.classList.add('error');
      retrigger(resultEl, 'shake');
      state.justEvaluated = false;                  /* let the user fix the expression */
    }
  }

  /* ---------- history ---------- */
  function addHistory(exprStr, value) {
    var first = state.history[0];
    if (first && first.expr === exprStr && first.result === value) return;
    state.history.unshift({ expr: exprStr, result: value });
    if (state.history.length > 50) state.history.length = 50;
    saveHistory();
    renderHistory(true);
    retrigger(histCount, 'bump');
  }

  function saveHistory() { save(STORAGE.history, JSON.stringify(state.history)); }

  function renderHistory(animateFirst) {
    histList.innerHTML = '';
    state.history.forEach(function (h, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hist-item' + (animateFirst && i === 0 ? ' new' : '');
      btn.title = 'Insert this result';
      var ex = document.createElement('span');
      ex.className = 'h-expr';
      ex.textContent = h.expr;
      var re = document.createElement('span');
      re.className = 'h-res';
      re.textContent = '= ' + group(formatResult(h.result));
      btn.appendChild(ex);
      btn.appendChild(re);
      btn.addEventListener('click', function () { reuseResult(h.result); });
      li.appendChild(btn);
      histList.appendChild(li);
    });
    histCount.textContent = String(state.history.length);
    histCount.hidden = state.history.length === 0;
    histEmpty.style.display = state.history.length ? 'none' : '';
  }

  function reuseResult(value) {
    var raw = String(P.round(value)).replace(/-/g, '−');
    if (state.justEvaluated || state.expr === '') {
      state.expr = raw;
      state.justEvaluated = false;
    } else {
      var c = lastChar();
      if (c && endsValue(c) && !isOperator(c)) state.expr += '×';
      state.expr += raw;
    }
    updateDisplay();
    retrigger(resultEl, 'pop');
  }

  /* ---------- toggles ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    save(STORAGE.theme, t);
  }

  function setMode(mode) { /* "basic" | "sci" */
    state.sci = mode === 'sci';
    calc.setAttribute('data-sci', state.sci ? 'on' : 'off');
    modeSwitch.setAttribute('data-mode', mode);
    var btns = modeSwitch.querySelectorAll('.mode-btn');
    btns[0].setAttribute('aria-pressed', String(!state.sci));
    btns[1].setAttribute('aria-pressed', String(state.sci));
    save(STORAGE.sci, state.sci ? '1' : '0');
  }

  function setHistory(open) {
    app.setAttribute('data-hist', open ? 'on' : 'off');
    histToggle.setAttribute('aria-expanded', String(open));
  }

  function setAngle(mode) {
    state.angleMode = mode;
    angleBtn.textContent = mode.toUpperCase();
    angleBtn.setAttribute('aria-label',
      'Angle unit: ' + (mode === 'deg' ? 'degrees' : 'radians'));
    angleBtn.classList.toggle('active', mode === 'rad');
    save(STORAGE.angle, mode);
    updateDisplay();
  }

  /* ---------- event wiring (one delegated listener for every button) ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var ins = btn.getAttribute('data-ins');
    if (act) {
      switch (act) {
        case 'clear': clearAll(); break;
        case 'back': backspace(); break;
        case 'equals': equals(); break;
        case 'sign': toggleSign(); break;
        case 'paren': smartParen(); break;
        case 'mode': setMode(btn.getAttribute('data-value')); break;
        case 'angle': setAngle(state.angleMode === 'deg' ? 'rad' : 'deg'); break;
        case 'theme':
          applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
          retrigger(btn, 'spin');
          break;
        case 'history': setHistory(app.getAttribute('data-hist') !== 'on'); break;
        case 'clear-history':
          state.history = [];
          saveHistory();
          renderHistory(false);
          break;
      }
    } else if (ins) {
      insert(ins);
    }
  });

  /* ripple effect on every button press */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('button');
    if (!btn || !btn.closest('.calculator, .history')) return;
    var r = btn.getBoundingClientRect();
    var d = Math.max(r.width, r.height) * 2.2;
    var span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = d + 'px';
    span.style.left = (e.clientX - r.left - d / 2) + 'px';
    span.style.top = (e.clientY - r.top - d / 2) + 'px';
    btn.appendChild(span);
  });

  /* clean up one-shot animation classes */
  document.addEventListener('animationend', function (e) {
    if (!e.target || !e.target.classList) return;
    if (e.target.classList.contains('ripple')) e.target.remove();
  });

  /* ---------- init ---------- */
  setAngle(state.angleMode);
  setMode(state.sci ? 'sci' : 'basic');
  renderHistory(false);
  if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) {
    setHistory(true); /* show the history panel by default on wide screens */
  }
  updateDisplay();
})();
