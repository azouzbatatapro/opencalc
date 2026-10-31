/*
 * OpenCalc parser tests — zero dependencies, no test framework needed.
 *
 * Run with:  node tests/parser.test.js
 * Exit code 0 = all tests passed, 1 = something failed.
 */
'use strict';

var P = require('../js/parser.js');

var passed = 0;
var failed = 0;

function check(expr, expected, opts, label) {
  var name = label || expr + (opts && opts.angleMode ? '  [' + opts.angleMode + ']' : '');
  try {
    var got = P.evaluate(expr, opts);
    var ok = typeof expected === 'number' &&
             Math.abs(got - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
    if (ok) {
      passed += 1;
      console.log('  \u2713 ' + name + '  = ' + got);
    } else {
      failed += 1;
      console.error('  \u2717 ' + name + '  expected ' + expected + ', got ' + got);
    }
  } catch (e) {
    failed += 1;
    console.error('  \u2717 ' + name + '  threw unexpectedly: ' + e.message);
  }
}

function checkThrows(expr, opts, label) {
  var name = label || ('"' + expr + '" should fail');
  try {
    var got = P.evaluate(expr, opts);
    failed += 1;
    console.error('  \u2717 ' + name + '  but returned ' + got);
  } catch (e) {
    passed += 1;
    console.log('  \u2713 ' + name + '  (' + e.message + ')');
  }
}

console.log('\nBasic arithmetic');
check('1+2', 3);
check('2+3\u00d74', 14);                 // precedence
check('(2+3)\u00d74', 20);
check('10\u00f74', 2.5);
check('100\u221225\u221225', 50);
check('0.1+0.2', 0.3);                   // float noise hidden
check('1.5\u00d73', 4.5);
check('.5\u00d72', 1);

console.log('\nPowers & signs');
check('2^10', 1024);
check('2^3^2', 512);                     // right associative
check('\u22122^2', -4);                  // unary minus binds looser than ^
check('(\u22122)^2', 4);
check('5\u2212\u22123', 8);
check('2\u00d7\u22123', -6);
check('\u22125+3', -2);

console.log('\nImplicit multiplication & constants');
check('2\u03c0', 2 * Math.PI);
check('2(3+1)', 8);
check('(1+1)(2+2)', 8);
check('2sin(30)', 1, { angleMode: 'deg' });
check('\u03c0\u00d72', 2 * Math.PI);
check('2e', 2 * Math.E);                 // lone "e" is Euler, not an exponent
check('1.5e2', 150);                     // "e" with digits is an exponent

console.log('\nScientific functions (degrees by default)');
check('sin(30)', 0.5);
check('cos(60)', 0.5);
check('tan(45)', 1);
check('sin(180)', 0);
check('cos(0)', 1);
check('\u221a16', 4);
check('\u221a(9+16)', 5);
check('9\u00b2', 81);
check('ln(e)', 1);
check('ln(e^2)', 2);
check('log(1000)', 3);
check('sin(\u03c0\u00f72)', 1, { angleMode: 'rad' });

console.log('\nFactorial & percent');
check('5!', 120);
check('(5\u22123)!', 2);
check('6!\u00f75!', 6);
check('50%', 0.5);
check('200\u00d710%', 20);

console.log('\nRounding');
check('1\u00f73\u00d73', 1);
check('2\u00f73', 2 / 3);

console.log('\nErrors (all of these must throw)');
checkThrows('2\u00f70');
checkThrows('5\u00f7(3\u22123)');
checkThrows('(2+3');
checkThrows('2+3)');
checkThrows('\u221a\u22124');
checkThrows('ln(0)');
checkThrows('log(\u22121)');
checkThrows('tan(90)', { angleMode: 'deg' });
checkThrows('(\u22121)!');
checkThrows('0.5!');
checkThrows('2+');
checkThrows('\u00d75');
checkThrows('');
checkThrows('abc');
checkThrows('3..5');
check('2e1', 20);         // "2e1.5" is also valid grammar: 2e1 × .5 = 10 (implicit ×)

console.log('\n----------------------------------------');
console.log(' ' + passed + ' passed, ' + failed + ' failed');
console.log('');

if (failed > 0) process.exitCode = 1;
