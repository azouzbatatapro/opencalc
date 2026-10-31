/*
 * OpenCalc — expression parser and evaluator.
 *
 * A tiny, dependency-free recursive-descent parser that powers the calculator.
 * It works in the browser (window.OpenCalcParser) and in Node (module.exports),
 * which makes it easy to unit-test: `node tests/parser.test.js`.
 *
 * Supported syntax
 *   numbers      12   3.14   .5   2e5
 *   operators    +  −  ×  ÷  ^    (ASCII + - * / are accepted too)
 *   postfix      !  (factorial)   ²  (square)   %  (percent → /100)
 *   constants    π  (pi)   e  (Euler's number)
 *   functions    sin  cos  tan  ln  log  √  (√ = square root)
 *   grouping     ( )
 *   implicit ×   "2π", "2(3+1)" and "2sin(30)" all work
 *
 * Usage
 *   OpenCalcParser.evaluate('2+3×4')                        → 14
 *   OpenCalcParser.evaluate('sin(30)', { angleMode:'deg' }) → 0.5
 *
 * Throws an Error with a friendly message on invalid input.
 * Results are rounded to 12 significant digits to hide float noise
 * (0.1 + 0.2 → 0.3, not 0.30000000000000004).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenCalcParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TRIG = { sin: true, cos: true, tan: true };

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  /* Convert an expression string into a token list. */
  function tokenize(input) {
    var tokens = [];
    var i = 0;

    while (i < input.length) {
      var ch = input[i];

      if (ch === ' ' || ch === '\t') { i += 1; continue; }

      // Numbers: 12, 3.14, .5 — plus scientific notation like 2e5 / 2e-5.
      if (isDigit(ch) || ch === '.') {
        var num = '';
        var dots = 0;
        while (i < input.length && (isDigit(input[i]) || input[i] === '.')) {
          if (input[i] === '.') dots += 1;
          num += input[i];
          i += 1;
        }
        // "e" starts an exponent only when digits follow (2e5, 2e-5);
        // otherwise it is Euler's constant, e.g. "2e" means 2 × e.
        if (input[i] === 'e' &&
            (isDigit(input[i + 1]) ||
             ((input[i + 1] === '+' || input[i + 1] === '-') && isDigit(input[i + 2])))) {
          num += input[i]; i += 1;
          if (input[i] === '+' || input[i] === '-') { num += input[i]; i += 1; }
          while (i < input.length && isDigit(input[i])) { num += input[i]; i += 1; }
        }
        if (dots > 1) throw new Error('Malformed number "' + num + '"');
        var value = parseFloat(num);
        if (Number.isNaN(value)) throw new Error('Malformed number "' + num + '"');
        tokens.push({ type: 'num', value: value });
        continue;
      }

      // Operators (ASCII aliases are normalised to the display symbols).
      if ('+-*/^×÷−'.indexOf(ch) !== -1) {
        var op = ch;
        if (ch === '*') op = '×';
        else if (ch === '/') op = '÷';
        else if (ch === '-') op = '−';
        tokens.push({ type: 'op', value: op });
        i += 1;
        continue;
      }

      if (ch === '(') { tokens.push({ type: 'lparen' }); i += 1; continue; }
      if (ch === ')') { tokens.push({ type: 'rparen' }); i += 1; continue; }
      if (ch === 'π') { tokens.push({ type: 'const', value: Math.PI }); i += 1; continue; }
      if (ch === 'e') { tokens.push({ type: 'const', value: Math.E }); i += 1; continue; }
      if (ch === '!') { tokens.push({ type: 'postfix', value: 'fact' }); i += 1; continue; }
      if (ch === '²') { tokens.push({ type: 'postfix', value: 'sq' }); i += 1; continue; }
      if (ch === '%') { tokens.push({ type: 'postfix', value: 'pct' }); i += 1; continue; }
      if (ch === '√') { tokens.push({ type: 'func', value: '√' }); i += 1; continue; }

      var fn = input.slice(i).match(/^(sin|cos|tan|ln|log)/);
      if (fn) { tokens.push({ type: 'func', value: fn[1] }); i += fn[1].length; continue; }

      throw new Error('Unexpected character "' + ch + '"');
    }

    return tokens;
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) {
      throw new Error('Factorial needs a non-negative whole number');
    }
    if (n > 170) throw new Error('Factorial is too large (max 170)');
    var r = 1;
    for (var i = 2; i <= n; i += 1) r *= i;
    return r;
  }

  /* Round to 12 significant digits and hide negative zero. */
  function round(value) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error('Result is not a finite number');
    }
    var v = parseFloat(value.toPrecision(12));
    return Object.is(v, -0) ? 0 : v;
  }

  /* Avoid showing tiny float noise such as sin(180°) = -1.2e-16. */
  function snap(v) {
    return Math.abs(v) < 1e-12 ? 0 : v;
  }

  function applyFunction(name, x, angleMode) {
    var v = (angleMode === 'deg' && TRIG[name]) ? x * Math.PI / 180 : x;

    switch (name) {
      case 'sin': return snap(Math.sin(v));
      case 'cos': return snap(Math.cos(v));
      case 'tan':
        if (angleMode === 'deg') {
          var m = ((x % 180) + 180) % 180;
          if (m === 90) throw new Error('tan is undefined at ' + x + '°');
        } else if (Math.abs(Math.cos(v)) < 1e-15) {
          throw new Error('tan is undefined at this angle');
        }
        return snap(Math.tan(v));
      case 'ln':  if (x <= 0) throw new Error('ln needs a positive number'); return Math.log(x);
      case 'log': if (x <= 0) throw new Error('log needs a positive number'); return Math.log10(x);
      case '√':   if (x < 0) throw new Error('√ of a negative number is not real'); return Math.sqrt(x);
      default: throw new Error('Unknown function "' + name + '"');
    }
  }

  /*
   * Grammar (lowest to highest precedence):
   *   expression := term  (('+' | '−') term)*
   *   term       := unary (('×' | '÷') unary)*          — implicit × handled here
   *   unary      := ('−' | '+') unary | power
   *   power      := postfix ('^' unary)?                — right associative
   *   postfix    := primary ('!' | '²' | '%')*
   *   primary    := number | constant | '(' expression ')' | function unary
   */
  function evaluate(expr, options) {
    var angleMode = options && options.angleMode === 'rad' ? 'rad' : 'deg';
    var tokens = tokenize(String(expr));
    if (tokens.length === 0) throw new Error('The expression is empty');
    var pos = 0;

    function peek() { return tokens[pos]; }

    function startsValue(t) {
      return t && (t.type === 'num' || t.type === 'const' || t.type === 'lparen' || t.type === 'func');
    }

    function parseExpression() {
      var value = parseTerm();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '−')) {
        var op = tokens[pos].value; pos += 1;
        var right = parseTerm();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      var value = parseUnary();
      for (;;) {
        var t = peek();
        if (t && t.type === 'op' && (t.value === '×' || t.value === '÷')) {
          pos += 1;
          var right = parseUnary();
          if (t.value === '÷' && right === 0) throw new Error('Division by zero');
          value = t.value === '×' ? value * right : value / right;
        } else if (startsValue(t)) {
          // Implicit multiplication: 2π, 2(3+1), 2sin(30)
          value = value * parseUnary();
        } else {
          break;
        }
      }
      return value;
    }

    function parseUnary() {
      var t = peek();
      if (t && t.type === 'op' && t.value === '−') { pos += 1; return -parseUnary(); }
      if (t && t.type === 'op' && t.value === '+') { pos += 1; return parseUnary(); }
      return parsePower();
    }

    function parsePower() {
      var base = parsePostfix();
      var t = peek();
      if (t && t.type === 'op' && t.value === '^') {
        pos += 1;
        var exponent = parseUnary(); // right associative: 2^3^2 = 2^(3^2)
        return Math.pow(base, exponent);
      }
      return base;
    }

    function parsePostfix() {
      var value = parsePrimary();
      for (;;) {
        var t = peek();
        if (t && t.type === 'postfix') {
          pos += 1;
          if (t.value === 'fact') value = factorial(value);
          else if (t.value === 'sq') value = value * value;
          else if (t.value === 'pct') value = value / 100;
        } else {
          break;
        }
      }
      return value;
    }

    function parsePrimary() {
      var t = tokens[pos]; pos += 1;
      if (!t) throw new Error('The expression ends too early');
      if (t.type === 'num' || t.type === 'const') return t.value;
      if (t.type === 'lparen') {
        var value = parseExpression();
        var close = tokens[pos]; pos += 1;
        if (!close || close.type !== 'rparen') throw new Error('Missing ")"');
        return value;
      }
      if (t.type === 'func') return applyFunction(t.value, parseUnary(), angleMode);
      throw new Error('Unexpected "' + (t.value !== undefined ? t.value : t.type) + '"');
    }

    var result = parseExpression();
    if (pos < tokens.length) {
      var extra = tokens[pos];
      throw new Error('Unexpected "' + (extra.value !== undefined ? extra.value : extra.type) + '"');
    }
    return round(result);
  }

  return {
    evaluate: evaluate,
    tokenize: tokenize,
    factorial: factorial,
    round: round
  };
});
